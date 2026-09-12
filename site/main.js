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
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
    if (!root.getAttribute('data-theme')) { paintToggle(); if (window.Charts) window.Charts.redrawAll(); }
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

    function init(id, params, seed, windowDays, daysPerTick, warm, onFrame) {
      handlers[id] = onFrame;
      if (usable && worker) {
        worker.postMessage({ id, type: 'init', params, seed, window: windowDays, daysPerTick, warm });
      } else {
        if (inline[id] && inline[id].timer) clearInterval(inline[id].timer);
        const sim = window.createSim(params, seed, windowDays, daysPerTick);
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

  // --- hero ---------------------------------------------------------------

  const heroBox = document.getElementById('hero-box');
  const heroCanvas = document.getElementById('hero-canvas');
  const heroStatus = document.getElementById('hero-status');

  function heroStill() {
    const img = document.createElement('img');
    img.src = 'assets/hero-still.svg';
    img.className = 'hero-still';
    img.alt = 'A still frame of the simulation: the market price, a solid line, ' +
      'wandering around a slower-moving dashed line for the fundamental value.';
    heroBox.replaceChildren(img);
    heroBox.style.height = 'auto';
    if (heroStatus) heroStatus.textContent = 'still frame — motion is switched off';
  }

  if (reduceMotion.matches) {
    heroStill();
  } else {
    let heroSnap = null;
    let heroFrames = 0;
    const heroStart = performance.now();

    Runner.init('hero', { N: 200 }, 8675309, 130, 0.5, 30, function (snap) {
      heroSnap = snap;
      heroFrames++;
      drawPricePanel(heroCanvas, snap, heroBox.clientHeight || 200, false);
      // A device that cannot keep up gets the still instead.
      if (heroFrames === 40 && performance.now() - heroStart > 9000) {
        Runner.pause('hero');
        heroStill();
      }
      if (snap.stalled) Runner.pause('hero');
    });
    Runner.run('hero', 55);

    if (heroStatus) {
      heroStatus.textContent = Runner.threaded ? 'running live' : 'running live (on this page)';
    }

    // Do not burn cycles on a panel nobody can see.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        for (const e of entries) {
          if (e.isIntersecting) Runner.run('hero', 55); else Runner.pause('hero');
        }
      }, { threshold: 0 }).observe(heroBox);
    }
    window.addEventListener('resize', function () {
      if (heroSnap) drawPricePanel(heroCanvas, heroSnap, heroBox.clientHeight || 200, false);
    });
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
