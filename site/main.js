/* main.js — theme, navigation, and the wiring between the data, the figures
   and the two live simulations. */

(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;

  // =======================================================================
  // Theme
  // =======================================================================

  const toggle = document.getElementById('theme-toggle');

  function currentTheme() {
    const set = root.getAttribute('data-theme');
    if (set) return set;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function paintToggle() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    toggle.textContent = next === 'dark' ? 'Dark' : 'Light';
    toggle.setAttribute('aria-label', 'Switch to the ' + next + ' theme');
  }

  toggle.addEventListener('click', function () {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
    paintToggle();
    if (window.Charts) window.Charts.redrawAll();
    document.dispatchEvent(new Event('themechange'));
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
    if (!root.getAttribute('data-theme')) {
      paintToggle();
      if (window.Charts) window.Charts.redrawAll();
      document.dispatchEvent(new Event('themechange'));
    }
  });
  paintToggle();

  // =======================================================================
  // Section navigation
  // =======================================================================

  const navLinks = Array.prototype.slice.call(document.querySelectorAll('.sectionnav a'));
  const sections = navLinks
    .map((a) => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);

  if ('IntersectionObserver' in window && sections.length) {
    const seen = new Map();
    const io = new IntersectionObserver(function (entries) {
      for (const e of entries) seen.set(e.target.id, e.intersectionRatio);
      let best = null, bestRatio = 0;
      seen.forEach(function (ratio, id) { if (ratio > bestRatio) { bestRatio = ratio; best = id; } });
      navLinks.forEach(function (a) {
        a.setAttribute('aria-current', a.getAttribute('href') === '#' + best ? 'true' : 'false');
      });
    }, { rootMargin: '-20% 0px -55% 0px', threshold: [0, 0.25, 0.5, 1] });
    sections.forEach((s) => io.observe(s));
  }

  // =======================================================================
  // Provenance captions and the statistics block
  // =======================================================================

  const RUN = window.RUN, DERIVED = window.DERIVED, MICRO = window.MICRO;

  if (RUN) {
    const line = 'Produced by a 2026 re-implementation of the 2003 model — ' +
      RUN.provenance.days.toLocaleString('en') + ' simulated days, ' +
      RUN.provenance.events.toLocaleString('en') + ' events, seed ' +
      RUN.provenance.seed + '. Not extracted from the original paper.';
    document.querySelectorAll('[data-provenance]').forEach(function (n) { n.textContent = line; });
  }

  if (DERIVED) {
    const s = DERIVED.stats;
    const block = document.getElementById('stats-block');
    if (block) {
      block.textContent =
        'For the run shown here: daily returns have a standard deviation of ' +
        s.retSd.toFixed(2) + '% and a kurtosis of ' + s.kurtosis.toFixed(1) +
        ' — a normal distribution would give 3. The largest single-day moves are ' +
        s.retMin.toFixed(1) + '% and +' + s.retMax.toFixed(1) + '%. Volatility and ' +
        'volume correlate at ' + s.corrVolVolume.toFixed(2) + '. The price departs ' +
        'from fundamental value by ' + s.mispricingSd.toFixed(2) + '% on average, and the ' +
        'market generates about ' + s.eventsPerDay.toLocaleString('en') + ' events a day. ' +
        'These are the re-implementation’s numbers, not the paper’s.';
    }
  }

  // =======================================================================
  // Charts
  // =======================================================================

  if (window.Charts && RUN && DERIVED) {
    Charts.priceChart(document.getElementById('fig-price'), RUN, DERIVED);
    Charts.returnsSpike(document.getElementById('fig-returns'), RUN.ret);
    Charts.distChart(document.getElementById('fig-dist'), DERIVED.hist);
    Charts.acfChart(document.getElementById('fig-acf'), DERIVED);
    Charts.scatterChart(document.getElementById('fig-scatter'), DERIVED);
    buildTables();
  }

  if (window.Figures) {
    Figures.strategyDiagram(document.getElementById('strategy-diagram'));
    Figures.clockRace(
      document.getElementById('clock-race'),
      document.getElementById('race-status'),
      { draw: document.getElementById('race-draw'), reset: document.getElementById('race-reset') }
    );
    Figures.businessTime(document.getElementById('business-time'));
    Figures.tickFigure(document.getElementById('tick-figure'), {
      step: document.getElementById('tick-step'),
      reset: document.getElementById('tick-reset'),
    });
  }

  // Accessible data tables standing in for the five figures.
  function buildTables() {
    const host = document.getElementById('data-tables');
    if (!host) return;
    const frag = document.createDocumentFragment();

    frag.appendChild(table(
      'Price and fundamental value, sampled every 250 days',
      ['Day', 'Price', 'Fundamental'],
      RUN.price.map(function (p, i) { return [i + 1, p, RUN.fundamental[i]]; })
        .filter(function (r, i) { return i % 250 === 0; })
    ));

    frag.appendChild(table(
      'Autocorrelation of volatility and of volume at selected lags',
      ['Lag, days', 'Volatility', 'Volume'],
      [1, 2, 5, 10, 20, 50, 100, 150, 200, 250]
        .filter(function (k) { return k <= DERIVED.acfAbsRet.length; })
        .map(function (k) { return [k, DERIVED.acfAbsRet[k - 1].toFixed(3), DERIVED.acfVolume[k - 1].toFixed(3)]; })
    ));

    const h = DERIVED.hist;
    frag.appendChild(table(
      'Return distribution against the normal, at selected standard deviations',
      ['Return, s.d.', 'Simulated density', 'Normal density'],
      [-6, -5, -4, -3, -2, 0, 2, 3, 4, 5, 6].map(function (v) {
        let best = 0, bd = Infinity;
        h.centres.forEach(function (c, i) { const d = Math.abs(c - v); if (d < bd) { bd = d; best = i; } });
        return [v, h.density[best].toExponential(2), h.normal[best].toExponential(2)];
      })
    ));

    const s = DERIVED.stats;
    frag.appendChild(table(
      'Summary statistics of the run',
      ['Quantity', 'Value'],
      [
        ['Daily return standard deviation', s.retSd.toFixed(3) + '%'],
        ['Kurtosis of daily returns', s.kurtosis.toFixed(2)],
        ['Largest daily fall', s.retMin.toFixed(2) + '%'],
        ['Largest daily rise', '+' + s.retMax.toFixed(2) + '%'],
        ['Correlation of volatility and volume', s.corrVolVolume.toFixed(3)],
        ['Standard deviation of mispricing', s.mispricingSd.toFixed(3) + '%'],
        ['Events per simulated day', s.eventsPerDay.toLocaleString('en')],
      ]
    ));

    host.replaceChildren(frag);
  }

  function table(caption, headers, rows) {
    const wrap = document.createElement('div');
    wrap.className = 'tablewrap';
    const t = document.createElement('table');
    const cap = document.createElement('caption');
    cap.textContent = caption;
    t.appendChild(cap);
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    headers.forEach(function (h, i) {
      const th = document.createElement('th');
      th.textContent = h;
      if (i > 0) th.className = 'num';
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    t.appendChild(thead);
    const tb = document.createElement('tbody');
    rows.forEach(function (r) {
      const row = document.createElement('tr');
      r.forEach(function (c, i) {
        const td = document.createElement('td');
        td.textContent = c;
        if (i > 0) td.className = 'num';
        row.appendChild(td);
      });
      tb.appendChild(row);
    });
    t.appendChild(tb);
    wrap.appendChild(t);
    return wrap;
  }

  // =======================================================================
  // The live simulations
  // =======================================================================

  // One worker serves both panels. If a worker cannot be created — which is the
  // case when the page is opened straight from disk — the same driver runs
  // inline instead, on a timer short enough not to be felt.
  const Runner = (function () {
    let worker = null;
    let usable = false;
    const handlers = {};
    const inline = {};

    try {
      worker = new Worker('sim.worker.js');
      worker.onmessage = function (e) {
        const h = handlers[e.data.id];
        if (h) h(e.data.data);
      };
      worker.onerror = function () { usable = false; worker = null; };
      usable = true;
    } catch (err) {
      worker = null;
      usable = false;
    }

    function init(id, params, seed, windowDays, perFrame, warm, onFrame, mode) {
      handlers[id] = onFrame;
      if (usable && worker) {
        worker.postMessage({ id, type: 'init', params, seed, window: windowDays, perFrame, warm, mode });
      } else {
        if (inline[id] && inline[id].timer) clearInterval(inline[id].timer);
        const sim = window.createSim(params, seed, windowDays, perFrame, mode);
        if (warm) sim.warm(warm);
        inline[id] = { sim, timer: null };
        onFrame(sim.snapshot());
      }
    }

    function run(id, interval) {
      if (usable && worker) { worker.postMessage({ id, type: 'run', interval }); return; }
      const rec = inline[id];
      if (!rec) return;
      if (rec.timer) clearInterval(rec.timer);
      rec.timer = setInterval(function () {
        rec.sim.advance();
        handlers[id](rec.sim.snapshot());
        if (rec.sim.stalled) { clearInterval(rec.timer); rec.timer = null; }
      }, interval || 40);
    }

    function pause(id) {
      if (usable && worker) { worker.postMessage({ id, type: 'pause' }); return; }
      const rec = inline[id];
      if (rec && rec.timer) { clearInterval(rec.timer); rec.timer = null; }
    }

    return { init, run, pause, get threaded() { return usable && !!worker; } };
  })();

  function canvasCtx(canvas, height) {
    const parent = canvas.parentNode;
    const W = Math.max(320, Math.round(parent.clientWidth || 720));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = height * dpr;
    canvas.style.width = '100%';
    canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, height);
    return { ctx, W, H: height };
  }

  function drawPricePanel(canvas, snap, height, showAxis) {
    const { ctx, W, H } = canvasCtx(canvas, height);
    const p = snap.price, f = snap.fund;
    if (!p.length) return;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < p.length; i++) {
      lo = Math.min(lo, p[i], f[i]); hi = Math.max(hi, p[i], f[i]);
    }
    const pad = Math.max(0.3, (hi - lo) * 0.12);
    lo -= pad; hi += pad;
    const L = showAxis ? 40 : 2, R = 2, T = 6, B = showAxis ? 20 : 6;
    const X = (i) => L + (i / Math.max(1, p.length - 1)) * (W - L - R);
    const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);

    if (showAxis) {
      ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = Charts.cssVar('--ink-mute');
      ctx.strokeStyle = Charts.cssVar('--rule');
      ctx.textAlign = 'right';
      for (const v of Charts.niceTicks(lo, hi, 3)) {
        ctx.beginPath(); ctx.moveTo(L, Y(v) + 0.5); ctx.lineTo(W - R, Y(v) + 0.5); ctx.stroke();
        ctx.fillText(v.toFixed(1), L - 6, Y(v) + 3.5);
      }
      ctx.textAlign = 'right';
      ctx.fillText('day ' + snap.day, W - R, H - 6);
    }

    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = Charts.cssVar('--fundamental');
    ctx.beginPath();
    for (let i = 0; i < f.length; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(i), Y(f[i]));
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = Charts.cssVar('--price');
    ctx.beginPath();
    for (let i = 0; i < p.length; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(i), Y(p[i]));
    ctx.stroke();

    ctx.fillStyle = Charts.cssVar('--price');
    ctx.beginPath();
    ctx.arc(X(p.length - 1), Y(p[p.length - 1]), 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPopulationBand(canvas, snap, height) {
    const { ctx, W, H } = canvasCtx(canvas, height);
    const n = snap.opt.length;
    if (!n) return;
    const total = snap.n;
    const X = (i) => (i / Math.max(1, n - 1)) * W;
    const bands = [
      { series: snap.opt, colour: Charts.cssVar('--optimist') },
      { series: snap.pess, colour: Charts.cssVar('--pessimist') },
      { series: snap.fnd, colour: Charts.cssVar('--fundamentalist') },
    ];
    const base = new Array(n).fill(0);
    for (const b of bands) {
      ctx.fillStyle = b.colour;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      for (let i = 0; i < n; i++) ctx.lineTo(X(i), H - (base[i] / total) * H);
      for (let i = n - 1; i >= 0; i--) {
        base[i] += b.series[i];
        ctx.lineTo(X(i), H - (base[i] / total) * H);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // --- hero dashboard -----------------------------------------------------
  //
  // Four panels sharing one axis of simulated time, fed by the tape mode of the
  // driver: every event the market has, in order, with the time it happened.
  // The point of putting them on one axis is that they can be read against each
  // other — the price ticks where the raster is dense, and goes quiet where it
  // is sparse. No controls; it simply runs.

  const heroDash = document.getElementById('hero-dash');
  const heroStatus = document.getElementById('hero-status');
  const heroReadout = document.getElementById('hero-readout');
  const heroCanvases = {
    price: document.getElementById('hero-price'),
    pop: document.getElementById('hero-pop'),
    raster: document.getElementById('hero-raster'),
    ed: document.getElementById('hero-ed'),
  };

  // Which of the ten events each raster row is, and the colour it takes. A
  // switch is coloured by the strategy the trader moves to, so the raster uses
  // the same palette as the population band directly above it.
  const EVENT_ROWS = [
    { sym: 'β₁', key: '--optimist' },
    { sym: 'β₂', key: '--pessimist' },
    { sym: 'β₃', key: '--optimist' },
    { sym: 'β₄', key: '--fundamentalist' },
    { sym: 'β₅', key: '--pessimist' },
    { sym: 'β₆', key: '--fundamentalist' },
    { sym: 'β₇', key: '--price' },
    { sym: 'β₈', key: '--price' },
    { sym: 'β₉', key: '--fundamental' },
    { sym: 'β₁₀', key: '--fundamental' },
  ];

  const RASTER_GUTTER = 34;

  // Panel heights follow the space the dashboard actually has. Beside the
  // copy on a laptop it is shorter, so that the whole hero clears the fold;
  // stacked under the copy it can afford to be taller.
  // Must match the two-column breakpoint in styles.css.
  const TWO_COLUMN = () => window.matchMedia('(min-width: 1120px)').matches;
  const SHORT = () => window.matchMedia('(max-height: 800px)').matches;
  const narrowDash = () => window.innerWidth < 620;
  const DASH_H = () => (TWO_COLUMN()
    ? (SHORT()
      // The raster needs ten legible rows more than the excess-demand panel
      // needs three, so they are not given the same height.
      ? { price: 92, pop: 24, raster: 108, ed: 88 }
      : { price: 120, pop: 30, raster: 112, ed: 100 })
    : narrowDash()
      ? { price: 124, pop: 34, raster: 112, ed: 112 }
      : { price: 140, pop: 38, raster: 124, ed: 124 });

  function heroStill() {
    const img = document.createElement('img');
    img.src = 'assets/hero-still.svg';
    img.className = 'hero-still';
    img.alt = 'A still frame of the simulation: the market price, a solid line, ' +
      'wandering around a slower-moving dashed line for the fundamental value.';
    heroDash.replaceChildren(img);
    if (heroStatus) {
      heroStatus.textContent = 'Motion is switched off, so the dashboard is ' +
        'shown as a still frame. The rest of the page is unaffected.';
    }
  }

  function fitCanvas(canvas, height) {
    const W = Math.max(220, Math.round(canvas.parentNode.clientWidth || 600));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== W * dpr || canvas.height !== height * dpr) {
      canvas.width = W * dpr;
      canvas.height = height * dpr;
      canvas.style.height = height + 'px';
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, height);
    return { ctx, W, H: height };
  }

  // The shared mapping from simulated time to x. Every panel uses it, and the
  // raster's gutter is reserved on all of them so the axes line up exactly.
  function timeScale(snap, W, gutter) {
    const span = Math.max(1e-6, snap.t - snap.t0);
    const left = gutter, right = W - 4;
    return (t) => left + ((t - snap.t0) / span) * (right - left);
  }

  function drawHeroPrice(snap) {
    const { ctx, W, H } = fitCanvas(heroCanvases.price, DASH_H().price);
    if (snap.price.length < 2) return;
    const X = timeScale(snap, W, RASTER_GUTTER);

    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < snap.price.length; i++) {
      lo = Math.min(lo, snap.price[i], snap.fund[i]);
      hi = Math.max(hi, snap.price[i], snap.fund[i]);
    }
    const pad = Math.max(0.25, (hi - lo) * 0.18);
    lo -= pad; hi += pad;
    const Y = (v) => 12 + (1 - (v - lo) / (hi - lo)) * (H - 24);

    ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = Charts.cssVar('--ink-mute');
    ctx.strokeStyle = Charts.cssVar('--rule');
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    for (const v of Charts.niceTicks(lo, hi, 3)) {
      ctx.beginPath();
      ctx.moveTo(RASTER_GUTTER, Y(v) + 0.5);
      ctx.lineTo(W - 4, Y(v) + 0.5);
      ctx.stroke();
      ctx.fillText(v.toFixed(1), RASTER_GUTTER - 5, Y(v) + 3.5);
    }

    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = Charts.cssVar('--fundamental');
    ctx.beginPath();
    for (let i = 0; i < snap.fund.length; i++) {
      const x = X(snap.time[i]), y = Y(snap.fund[i]);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();

    // The price is a step, not a line: it holds its quote until a price event
    // moves it by one tick. Drawing it as a slope would invent movement the
    // model never made.
    ctx.setLineDash([]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = Charts.cssVar('--price');
    ctx.beginPath();
    ctx.moveTo(X(snap.time[0]), Y(snap.price[0]));
    for (let i = 1; i < snap.price.length; i++) {
      const x = X(snap.time[i]);
      ctx.lineTo(x, Y(snap.price[i - 1]));
      ctx.lineTo(x, Y(snap.price[i]));
    }
    ctx.stroke();

    const lastX = X(snap.time[snap.time.length - 1]);
    const lastY = Y(snap.price[snap.price.length - 1]);
    ctx.fillStyle = Charts.cssVar('--price');
    ctx.beginPath();
    ctx.arc(lastX, lastY, 2.8, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHeroPopulation(snap) {
    const { ctx, W, H } = fitCanvas(heroCanvases.pop, DASH_H().pop);
    if (snap.opt.length < 2) return;
    const X = timeScale(snap, W, RASTER_GUTTER);
    const total = snap.n;

    const series = [
      { get: (i) => snap.opt[i], colour: Charts.cssVar('--optimist') },
      { get: (i) => snap.pess[i], colour: Charts.cssVar('--pessimist') },
      { get: (i) => total - snap.opt[i] - snap.pess[i], colour: Charts.cssVar('--fundamentalist') },
    ];
    const base = new Array(snap.opt.length).fill(0);
    ctx.globalAlpha = 0.8;
    for (const band of series) {
      ctx.fillStyle = band.colour;
      ctx.beginPath();
      for (let i = 0; i < base.length; i++) ctx.lineTo(X(snap.time[i]), H - (base[i] / total) * H);
      for (let i = base.length - 1; i >= 0; i--) {
        base[i] += band.get(i);
        ctx.lineTo(X(snap.time[i]), H - (base[i] / total) * H);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawHeroRaster(snap) {
    const { ctx, W, H } = fitCanvas(heroCanvases.raster, DASH_H().raster);
    const X = timeScale(snap, W, RASTER_GUTTER);
    const rowH = (H - 10) / 10;

    ctx.font = '9px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'left';
    for (let r = 0; r < 10; r++) {
      const y = 5 + r * rowH;
      ctx.strokeStyle = Charts.cssVar('--rule');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(RASTER_GUTTER, Math.round(y + rowH / 2) + 0.5);
      ctx.lineTo(W - 4, Math.round(y + rowH / 2) + 0.5);
      ctx.stroke();
      ctx.fillStyle = Charts.cssVar('--ink-mute');
      ctx.fillText(EVENT_ROWS[r].sym, 0, y + rowH / 2 + 3);
    }

    // events arrives flat: [t, type, t, type, …]
    const ev = snap.events;
    const newest = ev.length ? ev[ev.length - 2] : 0;
    for (let i = 0; i < ev.length; i += 2) {
      const t = ev[i], type = ev[i + 1];
      if (type < 0 || type > 9) continue;
      const y = 5 + type * rowH;
      // The most recent events are drawn at full strength and older ones fade,
      // so the eye is pulled to what is happening now.
      const age = (newest - t) / Math.max(1e-6, snap.t - snap.t0);
      ctx.globalAlpha = 0.4 + 0.6 * Math.max(0, 1 - age);
      ctx.fillStyle = Charts.cssVar(EVENT_ROWS[type].key);
      ctx.fillRect(X(t) - 1, y + rowH * 0.18, 2, rowH * 0.64);
    }
    ctx.globalAlpha = 1;
  }

  function drawHeroED(snap) {
    const { ctx, W, H } = fitCanvas(heroCanvases.ed, DASH_H().ed);
    const ed = snap.ed;
    const rows = [
      { label: 'chartists', v: ed.chart, colour: ed.chart >= 0 ? '--optimist' : '--pessimist' },
      { label: 'fundamentalists', v: ed.fund, colour: '--fundamentalist' },
      { label: 'excess demand', v: ed.total, colour: '--price' },
    ];

    // One line per row: label, bar, value. The two components sit above the sum
    // they make, all on the same scale, so the tug-of-war between them is the
    // shape of the panel.
    const LW = Math.min(104, Math.max(72, W * 0.3));
    const VW = 46;
    const span = W - LW - VW;
    const zero = LW + span / 2;
    const mag = Math.max(0.4, Math.abs(ed.chart), Math.abs(ed.fund), Math.abs(ed.total));
    const scale = (span / 2 - 2) / mag;

    const rowGap = (H - 34) / 3;
    const barH = Math.min(14, rowGap - 7);

    ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    ctx.strokeStyle = Charts.cssVar('--rule-strong');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(zero) + 0.5, 10);
    ctx.lineTo(Math.round(zero) + 0.5, 16 + 2 * rowGap + barH + 4);
    ctx.stroke();

    rows.forEach(function (row, i) {
      const y = 16 + i * rowGap;
      const h = i === 2 ? barH + 2 : barH;
      const len = row.v * scale;
      const mid = y + h / 2 + 3.5;

      ctx.fillStyle = i === 2 ? Charts.cssVar('--ink-soft') : Charts.cssVar('--ink-mute');
      ctx.textAlign = 'left';
      ctx.fillText(row.label, 0, mid);

      ctx.fillStyle = Charts.cssVar(row.colour);
      ctx.globalAlpha = i === 2 ? 1 : 0.6;
      ctx.fillRect(len >= 0 ? zero : zero + len, y, Math.max(1.5, Math.abs(len)), h);
      ctx.globalAlpha = 1;

      // Values live in their own right-hand column rather than chasing the end
      // of the bar: a long negative bar would otherwise put its number on top
      // of the label.
      ctx.fillStyle = i === 2 ? Charts.cssVar('--ink') : Charts.cssVar('--ink-mute');
      ctx.textAlign = 'right';
      ctx.fillText((row.v >= 0 ? '+' : '') + row.v.toFixed(2), W, mid);
    });

    ctx.fillStyle = Charts.cssVar('--ink-mute');
    ctx.textAlign = 'left';
    ctx.fillText(ed.total >= 0 ? 'the next tick goes up' : 'the next tick goes down', 0, H - 5);
  }

  function paintReadout(snap) {
    if (!heroReadout) return;
    const gap = 100 * (snap.price.length
      ? (snap.price[snap.price.length - 1] - snap.fund[snap.fund.length - 1]) /
        snap.fund[snap.fund.length - 1]
      : 0);
    const values = {
      day: snap.day.toLocaleString('en'),
      events: snap.eventCount.toLocaleString('en'),
      price: snap.price.length ? snap.price[snap.price.length - 1].toFixed(1) : '—',
      gap: (gap >= 0 ? '+' : '') + gap.toFixed(2) + '%',
      n: String(snap.n),
    };
    heroReadout.querySelectorAll('dd').forEach(function (dd) {
      const v = values[dd.getAttribute('data-k')];
      if (v !== undefined && dd.textContent !== v) dd.textContent = v;
    });
  }

  function drawHero(snap) {
    if (!snap || snap.mode !== 'tape') return;
    drawHeroPrice(snap);
    drawHeroPopulation(snap);
    drawHeroRaster(snap);
    drawHeroED(snap);
    paintReadout(snap);
  }

  if (reduceMotion.matches) {
    heroStill();
  } else {
    let heroSnap = null;
    let heroFrames = 0;
    const heroStart = performance.now();

    // A window of two simulated days, advanced by four hundredths of a day each
    // frame — about fifteen events. Short enough that the raster's gaps are
    // legible rather than crushed against the right-hand edge, long enough that
    // the price line has a shape, and plainly moving within a second.
    // The window is set from the width the raster actually gets, so that its
    // marks stay separable: a raster whose gaps have closed up is just a bar.
    // About four hundred events across the panel, whatever the panel's width.
    const rasterW = heroCanvases.raster.parentNode.clientWidth || 400;
    const heroWindow = Math.max(0.6, Math.min(1.8, rasterW / 360));
    Runner.init('hero', { N: 200 }, 8675309, heroWindow, 0.04, heroWindow * 1.1, function (snap) {
      heroSnap = snap;
      heroFrames++;
      drawHero(snap);
      // A device that cannot keep up gets the still instead.
      if (heroFrames === 40 && performance.now() - heroStart > 9000) {
        Runner.pause('hero');
        heroStill();
      }
      if (snap.stalled) Runner.pause('hero');
    }, 'tape');
    Runner.run('hero', 55);

    if (heroStatus) {
      heroStatus.textContent = Runner.threaded
        ? 'Running live, in a background thread, so it never interrupts your scrolling.'
        : 'Running live in this page.';
    }

    // Do not burn cycles on a panel nobody can see.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        for (const e of entries) {
          if (e.isIntersecting) Runner.run('hero', 55); else Runner.pause('hero');
        }
      }, { threshold: 0 }).observe(heroDash);
    }
    window.addEventListener('resize', function () { if (heroSnap) drawHero(heroSnap); });
    document.addEventListener('themechange', function () { if (heroSnap) drawHero(heroSnap); });
  }

  // --- playground ---------------------------------------------------------

  const PRESETS = {
    calibrated: { a1: 0.7, tf: 3, beta: 4, N: 200 },
    herding: { a1: 1.6, tf: 3, beta: 4, N: 200 },
    fundamentalists: { a1: 0.4, tf: 7, beta: 4, N: 200 },
    thin: { a1: 0.9, tf: 2, beta: 9, N: 75 },
  };

  const pgPrice = document.getElementById('pg-price');
  const pgPop = document.getElementById('pg-pop');
  const pgStatus = document.getElementById('pg-status');
  const pgToggle = document.getElementById('pg-toggle');
  const inputs = {
    a1: document.getElementById('c-a1'),
    tf: document.getElementById('c-tf'),
    beta: document.getElementById('c-beta'),
    N: document.getElementById('c-N'),
  };
  const outputs = {
    a1: document.getElementById('o-a1'),
    tf: document.getElementById('o-tf'),
    beta: document.getElementById('o-beta'),
    N: document.getElementById('o-N'),
  };

  let pgSnap = null;
  let pgRunning = false;

  function readControls() {
    return {
      a1: parseFloat(inputs.a1.value),
      tf: parseFloat(inputs.tf.value),
      beta: parseFloat(inputs.beta.value),
      N: parseInt(inputs.N.value, 10),
    };
  }

  function paintOutputs(v) {
    outputs.a1.textContent = v.a1.toFixed(2);
    outputs.tf.textContent = v.tf.toFixed(1);
    outputs.beta.textContent = v.beta.toFixed(1);
    outputs.N.textContent = String(v.N);
  }

  function restart(run) {
    const v = readControls();
    paintOutputs(v);
    Runner.init('pg', v, 1618033, 260, 0.6, 30, function (snap) {
      pgSnap = snap;
      drawPricePanel(pgPrice, snap, 250, true);
      drawPopulationBand(pgPop, snap, 70);
      if (pgStatus) {
        if (snap.stalled) {
          pgStatus.textContent =
            'These settings drive the transition rates so high that the market’s ' +
            'internal clock stops advancing — one of the pathological cases the ' +
            'chapter’s first calibration step was designed to discard. Move a ' +
            'slider back, or reset.';
          setRunning(false);
        } else {
          pgStatus.textContent = 'Simulated day ' + snap.day + ' · ' + snap.n + ' traders' +
            (Runner.threaded ? '' : ' · running on the page rather than in a worker');
        }
      }
    });
    if (run !== false) { setRunning(true); } else { setRunning(false); }
  }

  function setRunning(on) {
    pgRunning = on;
    if (on) Runner.run('pg', 55); else Runner.pause('pg');
    pgToggle.textContent = on ? 'Pause' : 'Run';
    pgToggle.setAttribute('aria-pressed', String(on));
  }

  if (pgPrice) {
    let debounce = null;
    Object.keys(inputs).forEach(function (k) {
      inputs[k].addEventListener('input', function () {
        paintOutputs(readControls());
        document.querySelectorAll('[data-preset]').forEach(function (b) {
          b.setAttribute('aria-pressed', 'false');
        });
        clearTimeout(debounce);
        debounce = setTimeout(function () { restart(pgRunning); }, 220);
      });
    });

    document.querySelectorAll('[data-preset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const p = PRESETS[btn.getAttribute('data-preset')];
        inputs.a1.value = p.a1; inputs.tf.value = p.tf;
        inputs.beta.value = p.beta; inputs.N.value = p.N;
        document.querySelectorAll('[data-preset]').forEach(function (b) {
          b.setAttribute('aria-pressed', String(b === btn));
        });
        restart(true);
      });
    });

    pgToggle.addEventListener('click', function () { setRunning(!pgRunning); });
    document.getElementById('pg-reset').addEventListener('click', function () {
      const p = PRESETS.calibrated;
      inputs.a1.value = p.a1; inputs.tf.value = p.tf;
      inputs.beta.value = p.beta; inputs.N.value = p.N;
      document.querySelectorAll('[data-preset]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-preset') === 'calibrated'));
      });
      restart(true);
    });

    window.addEventListener('resize', function () {
      if (pgSnap) { drawPricePanel(pgPrice, pgSnap, 250, true); drawPopulationBand(pgPop, pgSnap, 70); }
    });

    // The playground only starts once it has been scrolled to, and stops again
    // when it leaves. Under reduced motion it waits for an explicit Run.
    let started = false;
    const startWhenSeen = function () {
      if (started) return;
      started = true;
      restart(!reduceMotion.matches);
    };
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        for (const e of entries) {
          if (e.isIntersecting) { startWhenSeen(); if (pgRunning) Runner.run('pg', 55); }
          else if (started) Runner.pause('pg');
        }
      }, { threshold: 0 }).observe(pgPrice);
    } else {
      startWhenSeen();
    }
  }
})();
