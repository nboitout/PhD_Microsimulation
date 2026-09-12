/* sim-driver.js — drives the model for the two live panels on the page.
   Loaded both by sim.worker.js (via importScripts) and by the page itself, so
   that the same driver runs whether or not a Web Worker is available. It never
   contains any of the model: that is entirely in sim-core.js. */

(function (global) {
  'use strict';

  function createSim(params, seed, windowDays, daysPerTick) {
    const Market = global.SimCore.Market;
    let market = new Market(params, seed || (Date.now() & 0x7fffffff));
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

    function warm(days) {
      for (let d = 0; d < days && !stalled; d++) advance(1);
    }

    return {
      advance,
      warm,
      get stalled() { return stalled; },
      snapshot() {
        return {
          price: price.slice(), fund: fund.slice(),
          opt: opt.slice(), pess: pess.slice(), fnd: fnd.slice(),
          day: Math.round(day), n: market.n, stalled,
        };
      },
    };
  }

  global.createSim = createSim;
})(typeof self !== 'undefined' ? self : this);
