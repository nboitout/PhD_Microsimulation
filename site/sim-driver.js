/* sim-driver.js — drives the model for the live panels on the page. Loaded both
   by sim.worker.js (via importScripts) and by the page itself, so that the same
   driver runs whether or not a Web Worker is available. It contains none of the
   model: that is entirely in sim-core.js.

   Two modes, because the two live panels want different things.

   "daily" — the playground. Advances whole simulated days and records the
   closing price of each, which is the chapter's own recording rule. A visitor
   changing a slider wants to see weeks of consequence, not seconds.

   "tape" — the dashboard at the top of the page. Advances a fraction of a day
   per frame and records every single event as it happens, so that the price
   line, the population and the event raster all sit on one shared axis of
   simulated time. This is what makes the irregularity of trading time visible:
   the events are not evenly spaced, and neither are the price ticks. */

(function (global) {
  'use strict';

  // ---------------------------------------------------------------------
  // daily: whole days, closing prices
  // ---------------------------------------------------------------------

  function createDaily(params, seed, windowDays, daysPerTick) {
    const Market = global.SimCore.Market;
    const market = new Market(params, seed || (Date.now() & 0x7fffffff));
    let day = 0;
    const cap = windowDays;
    const price = [], fund = [], opt = [], pess = [], fnd = [];
    let stalled = false;

    function push() {
      price.push(market.p);
      fund.push(market.pf);
      opt.push(market.nPlus);
      pess.push(market.nMinus);
      fnd.push(market.nFund);
      if (price.length > cap) {
        price.shift(); fund.shift(); opt.shift(); pess.shift(); fnd.shift();
      }
    }

    // A generous per-day event budget. If it is ever exhausted the parameter
    // combination has driven the rates to the point where the internal clock
    // barely advances, so the panel says so rather than freezing the page.
    const BUDGET = 120000;

    function advance(days) {
      if (stalled) return;
      const target = day + (days || daysPerTick);
      while (day < target) {
        day += 1;
        const used = market.runToDay(day, BUDGET);
        if (used >= BUDGET) { stalled = true; push(); return; }
        push();
        market.ticks = 0;
        market.volume = 0;
      }
    }

    return {
      advance,
      warm(days) { for (let d = 0; d < days && !stalled; d++) advance(1); },
      get stalled() { return stalled; },
      snapshot() {
        return {
          mode: 'daily',
          price: price.slice(), fund: fund.slice(),
          opt: opt.slice(), pess: pess.slice(), fnd: fnd.slice(),
          day: Math.round(day), n: market.n, stalled,
        };
      },
    };
  }

  // ---------------------------------------------------------------------
  // tape: every event, on one axis of simulated time
  // ---------------------------------------------------------------------

  function createTape(params, seed, windowDays, daysPerFrame) {
    const Market = global.SimCore.Market;
    const market = new Market(params, seed || (Date.now() & 0x7fffffff));
    let stalled = false;

    // Parallel arrays, one entry per realised event. `start` is the index of
    // the oldest entry still inside the window; the front is spliced off only
    // occasionally, so the common path stays a pair of pushes.
    const T = [], P = [], F = [], O = [], M = [], E = [];
    let start = 0;
    let eventCount = 0;

    // How many points each panel is sent per frame. The tape holds a few
    // thousand events; drawing every one of them at a few hundred pixels wide
    // would be wasted work, and posting them all across the worker boundary
    // more so.
    const LINE_POINTS = 360;
    // Effectively "every event still inside the window". The window is short
    // enough that this is a few hundred marks, and drawing all of them is the
    // point: the raster is only worth having if its gaps are real.
    const RASTER_EVENTS = 1500;

    const BUDGET = 60000;

    function record(which) {
      T.push(market.t);
      P.push(market.p);
      F.push(market.pf);
      O.push(market.nPlus);
      M.push(market.nMinus);
      E.push(which);
      eventCount++;
    }

    function trim() {
      const cutoff = market.t - windowDays;
      while (start < T.length && T[start] < cutoff) start++;
      // Reclaim the front in batches rather than on every event.
      if (start > 3000) {
        T.splice(0, start); P.splice(0, start); F.splice(0, start);
        O.splice(0, start); M.splice(0, start); E.splice(0, start);
        start = 0;
      }
    }

    function advance(dt) {
      if (stalled) return;
      const target = market.t + (dt || daysPerFrame);
      let guard = 0;
      while (market.t < target) {
        if (guard++ >= BUDGET) { stalled = true; return; }
        const which = market.step();
        if (which >= 0) record(which);
      }
      trim();
    }

    function warm(days) {
      // Fill the window before the first frame, so the dashboard opens with a
      // tape already running rather than with an empty axis.
      const target = market.t + days;
      let guard = 0;
      while (market.t < target && guard++ < BUDGET * 4) {
        const which = market.step();
        if (which >= 0) record(which);
      }
      trim();
    }

    return {
      advance,
      warm,
      get stalled() { return stalled; },
      snapshot() {
        const n = T.length - start;
        if (n <= 1) {
          return { mode: 'tape', t: market.t, t0: market.t, time: [], price: [],
            fund: [], opt: [], pess: [], n: market.n, events: [], stalled,
            ed: { chart: 0, fund: 0, total: 0 }, day: 0, eventCount };
        }

        const stride = Math.max(1, Math.ceil(n / LINE_POINTS));
        const time = [], price = [], fund = [], opt = [], pess = [];
        for (let i = start; i < T.length; i += stride) {
          time.push(T[i]); price.push(P[i]); fund.push(F[i]);
          opt.push(O[i]); pess.push(M[i]);
        }
        // Always end on the newest sample, so the line reaches the right edge.
        const last = T.length - 1;
        if (time[time.length - 1] !== T[last]) {
          time.push(T[last]); price.push(P[last]); fund.push(F[last]);
          opt.push(O[last]); pess.push(M[last]);
        }

        const from = Math.max(start, T.length - RASTER_EVENTS);
        const events = [];
        for (let i = from; i < T.length; i++) events.push(T[i], E[i]);

        const chart = (market.nPlus - market.nMinus) * market.P.tc;
        const fundED = market.nFund * market.P.tf * (market.pf - market.p) / market.p;

        return {
          mode: 'tape',
          t: market.t,
          t0: T[start],
          time, price, fund, opt, pess,
          events,
          ed: { chart, fund: fundED, total: chart + fundED },
          n: market.n,
          day: Math.floor(market.t),
          eventCount,
          stalled,
        };
      },
    };
  }

  // The playground and the worker both still call createSim; `mode` selects.
  function createSim(params, seed, windowDays, perFrame, mode) {
    return mode === 'tape'
      ? createTape(params, seed, windowDays, perFrame)
      : createDaily(params, seed, windowDays, perFrame);
  }

  global.createSim = createSim;
})(typeof self !== 'undefined' ? self : this);
