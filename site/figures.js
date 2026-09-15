/* figures.js — the explanatory illustrations, as opposed to the data charts:
   the strategy diagram, the ten competing clocks, the business-time staircase,
   and the excess-demand stepper. All inline SVG so both themes come free. */

(function (global) {
  'use strict';

  const C = global.Charts;
  const el = C.el, text = C.text, path = C.path, register = C.register, frame = C.frame;

  const LABELS = [
    'pessimist → optimist',
    'optimist → pessimist',
    'fundamentalist → optimist',
    'optimist → fundamentalist',
    'fundamentalist → pessimist',
    'pessimist → fundamentalist',
    'price up one tick',
    'price down one tick',
    'fundamental value up',
    'fundamental value down',
  ];
  const SYMBOLS = ['β₁', 'β₂', 'β₃', 'β₄', 'β₅', 'β₆', 'β₇', 'β₈', 'β₉', 'β₁₀'];

  // Shorter forms for narrow screens, where the full phrase will not fit.
  const SHORT = [
    'pess → opt', 'opt → pess', 'fund → opt', 'opt → fund', 'fund → pess',
    'pess → fund', 'price up', 'price down', 'news up', 'news down',
  ];

  // =======================================================================
  // The crowd: three strategies, six switches, one live population
  // =======================================================================
  //
  // One dot is one trader. The model in sim-core.js runs underneath, event by
  // event, and every switch it realises is drawn as a dot travelling along the
  // arrow for that switch. Switches are replayed at the simulated times they
  // happened, scaled to a watchable speed, so the bursts are the model's own
  // rather than an animation's rhythm. Arrow width follows the switch's
  // current rate, so a flow can be seen strengthening before it fires.

  const SWITCHES = [
    { i: 0, from: 'pess', to: 'opt', label: 'a pessimist turns optimistic',
      why: 'Two chartists meet. The crowd has tilted bullish, or the recent trend has been up, and the pessimist changes sides.' },
    { i: 1, from: 'opt', to: 'pess', label: 'an optimist turns pessimistic',
      why: 'The same meeting with the opposite tilt: the opinion index or the trend runs against the optimist, who turns bearish.' },
    { i: 2, from: 'fund', to: 'opt', label: 'a fundamentalist turns optimistic',
      why: 'A fundamentalist meets an optimist whose rising trend has been paying better than waiting for the price to come back to value.' },
    { i: 3, from: 'opt', to: 'fund', label: 'an optimist turns fundamentalist',
      why: 'The optimist gives up on the trend and takes the mispricing instead. The wider the gap between price and value, the likelier this is.' },
    { i: 4, from: 'fund', to: 'pess', label: 'a fundamentalist turns pessimistic',
      why: 'A falling trend has been paying better than waiting for the correction, so the fundamentalist joins the bears.' },
    { i: 5, from: 'pess', to: 'fund', label: 'a pessimist turns fundamentalist',
      why: 'The pessimist abandons the chart for the gap between price and fundamental value, discounted because the correction is not immediate.' },
  ];

  const STRATEGY = {
    opt: { colour: 'var(--optimist)', name: 'Optimistic chartists', sub: 'expect a rise — they buy' },
    pess: { colour: 'var(--pessimist)', name: 'Pessimistic chartists', sub: 'expect a fall — they sell' },
    fund: { colour: 'var(--fundamentalist)', name: 'Fundamentalists', sub: 'trade the gap to fair value' },
  };

  // Small enough that every trader is a visible dot, large enough that the
  // shares move smoothly. The calibrated population is 400.
  const CROWD_N = 120;
  // Simulated days per second of real time, for the two speeds.
  const SPEEDS = { watch: 0.012, fast: 0.2 };
  const HOUR = 1 / 24;

  function strategyDiagram(node, ui) {
    const SimCore = global.SimCore;
    if (!SimCore || !node) return;
    const reduceMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let market = null;
    let a1 = 0.7;
    let speed = 'watch';
    let running = false;
    let visible = false;
    let switches = 0;
    const rateBuf = new Float64Array(10);
    const shownRate = new Float64Array(6);   // smoothed, for arrow widths

    // Scene state, rebuilt by draw() on resize or theme change.
    let geo = null;          // node centres, radii, arrow curves
    let dots = [];           // { el, key, x, y, fly }
    let members = null;      // { opt: [dotIndex…], pess: […], fund: […] }
    let arrowEls = [];       // per switch: { line, hit }
    let countEls = {};
    let hover = -1;
    const pending = [];      // switches waiting to be replayed: { at, s }

    function newMarket() {
      market = new SimCore.Market({ N: CROWD_N, a1 }, 20030601);
      // Settle for a simulated day, so the crowd does not open at an exact
      // three-way split that the model would never otherwise show.
      let guard = 0;
      while (market.t < 1 && guard++ < 200000) market.step();
      switches = 0;
      pending.length = 0;
    }

    function counts() {
      return { opt: market.nPlus, pess: market.nMinus, fund: market.nFund };
    }

    // Phyllotaxis packing: slot k sits a little further out than slot k-1, so
    // a cluster grows and shrinks from its rim and never shows a hole.
    function slot(key, k) {
      const g = geo.nodes[key];
      const a = k * 2.399963;
      const r = geo.spacing * Math.sqrt(k + 0.5);
      return [g.x + r * Math.cos(a), g.y + r * Math.sin(a)];
    }

    function assignAll() {
      const c = counts();
      members = { opt: [], pess: [], fund: [] };
      let d = 0;
      for (const key of ['opt', 'pess', 'fund']) {
        for (let k = 0; k < c[key]; k++, d++) {
          members[key].push(d);
          const dot = dots[d];
          const [x, y] = slot(key, k);
          dot.key = key; dot.x = x; dot.y = y; dot.fly = null;
          dot.el.setAttribute('cx', x.toFixed(1));
          dot.el.setAttribute('cy', y.toFixed(1));
          dot.el.setAttribute('fill', STRATEGY[key].colour);
        }
      }
      paintCounts();
    }

    function paintCounts() {
      if (!members) return;
      for (const key in countEls) {
        const n = members[key].length;
        countEls[key].textContent = n + ' · ' + Math.round((100 * n) / CROWD_N) + '%';
      }
    }

    function draw() {
      const W0 = Math.max(320, Math.round(node.clientWidth || 600));
      const narrow = W0 < 520;
      const R = Math.max(46, Math.min(70, W0 * 0.12));
      const dx = Math.min(W0 / 2 - R - 14, 250);
      const topY = (narrow ? 42 : 62) + R;
      const fundY = topY + Math.max(190, dx * 1.05);
      const H = Math.round(fundY + R + (narrow ? 42 : 52));
      const { svg, W } = frame(node, H);
      const cx = W / 2;

      geo = {
        nodes: {
          opt: { x: cx - dx, y: topY },
          pess: { x: cx + dx, y: topY },
          fund: { x: cx, y: fundY },
        },
        R,
        // Up to 80% of the crowd can sit in one strategy; that many dots must fit.
        spacing: (R - 5) / Math.sqrt(CROWD_N * 0.8 + 0.5),
        arrows: [],
      };
      const dotR = Math.max(1.6, geo.spacing * 0.46);

      const defs = el('defs');
      for (const key in STRATEGY) {
        defs.appendChild(el('marker', {
          id: 'crowd-arrow-' + key, viewBox: '0 0 10 10', refX: 8, refY: 5,
          markerWidth: 9, markerHeight: 9, markerUnits: 'userSpaceOnUse',
          orient: 'auto-start-reverse',
        }, [el('path', { d: 'M0 0 L10 5 L0 10 z', fill: STRATEGY[key].colour })]));
      }
      svg.appendChild(defs);

      // Rings first, so the arrows and the dots in flight draw over them.
      for (const key in STRATEGY) {
        const nd = geo.nodes[key], st = STRATEGY[key];
        svg.appendChild(el('circle', { cx: nd.x, cy: nd.y, r: R, fill: st.colour, 'fill-opacity': 0.07, stroke: st.colour, 'stroke-width': 1.4 }));
        const below = key === 'fund';
        svg.appendChild(text(st.name, {
          x: nd.x, y: below ? nd.y + R + 18 : nd.y - R - (narrow ? 24 : 38),
          class: 'serieslabel', 'text-anchor': 'middle', fill: st.colour,
        }));
        const count = text('', {
          x: nd.x, y: below ? nd.y + R + 33 : nd.y - R - (narrow ? 10 : 23),
          class: 'annot crowd-count', 'text-anchor': 'middle', fill: 'var(--ink-soft)',
        });
        countEls[key] = count;
        svg.appendChild(count);
        if (!narrow) {
          svg.appendChild(text(st.sub, {
            x: nd.x, y: below ? nd.y + R + 47 : nd.y - R - 9,
            class: 'annot', 'text-anchor': 'middle',
          }));
        }
      }

      arrowEls = [];
      const arrowLayer = el('g');
      for (const s of SWITCHES) {
        const a = geo.nodes[s.from], b = geo.nodes[s.to];
        const ddx = b.x - a.x, ddy = b.y - a.y;
        const len = Math.hypot(ddx, ddy);
        const ux = ddx / len, uy = ddy / len;
        // The two directions of each edge bow to opposite sides.
        const ox = -uy, oy = ux, off = 10;
        const x1 = a.x + ux * (R + 4) + ox * off, y1 = a.y + uy * (R + 4) + oy * off;
        const x2 = b.x - ux * (R + 6) + ox * off, y2 = b.y - uy * (R + 6) + oy * off;
        const mx = (x1 + x2) / 2 + ox * 22, my = (y1 + y2) / 2 + oy * 22;
        geo.arrows[s.i] = { x1, y1, x2, y2, mx, my };
        const d = `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;

        // Focusable so that a keyboard visitor can reveal the explanation;
        // labelled as an image because nothing is activated.
        const g = el('g', { class: 'switch-arrow', tabindex: '0', role: 'img',
          'aria-label': SYMBOLS[s.i] + ': ' + s.label + '. ' + s.why });
        const hit = el('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': 22 });
        const line = el('path', {
          d, fill: 'none', stroke: STRATEGY[s.to].colour, 'stroke-linecap': 'round',
          'stroke-width': 1.5, opacity: 0.5, 'marker-end': `url(#crowd-arrow-${s.to})`,
        });
        g.appendChild(hit);
        g.appendChild(line);
        g.appendChild(text(SYMBOLS[s.i], {
          x: mx + ox * 13, y: my + oy * 13 + 4, class: 'clocklabel', 'text-anchor': 'middle',
        }));
        const enter = () => { hover = s.i; paintArrows(); explain(); };
        const leave = () => { if (hover === s.i) { hover = -1; paintArrows(); explain(); } };
        g.addEventListener('mouseenter', enter);
        g.addEventListener('focus', enter);
        g.addEventListener('mouseleave', leave);
        g.addEventListener('blur', leave);
        g.addEventListener('pointerdown', enter);
        arrowEls[s.i] = { line, g };
        arrowLayer.appendChild(g);
      }
      svg.appendChild(arrowLayer);

      const dotLayer = el('g', { 'aria-hidden': 'true' });
      dots = [];
      for (let i = 0; i < CROWD_N; i++) {
        const c = el('circle', { r: dotR.toFixed(2) });
        dotLayer.appendChild(c);
        dots.push({ el: c, key: null, x: 0, y: 0, fly: null });
      }
      svg.appendChild(dotLayer);

      svg.appendChild(el('title', {}, [document.createTextNode(
        'A live diagram of ' + CROWD_N + ' traders, one dot each, grouped into ' +
        'optimistic chartists, pessimistic chartists and fundamentalists, and ' +
        'joined by six arrows, one for each way a trader can switch strategy. ' +
        'Dots move along the arrows as the model realises each switch.')]));

      // Any flight in progress is abandoned: the scene has just been rebuilt.
      assignAll();
      readRates(true);
      paintArrows();
    }

    // --- the model's side -------------------------------------------------

    function readRates(snap) {
      market.rates(rateBuf);
      for (let i = 0; i < 6; i++) {
        shownRate[i] = snap ? rateBuf[i] : shownRate[i] + 0.15 * (rateBuf[i] - shownRate[i]);
      }
    }

    function paintArrows() {
      if (!arrowEls.length) return;
      let max = 0;
      for (let i = 0; i < 6; i++) max = Math.max(max, shownRate[i]);
      for (let i = 0; i < 6; i++) {
        const w = 1 + 6.5 * Math.sqrt(shownRate[i] / (max || 1));
        const on = hover === i;
        arrowEls[i].line.setAttribute('stroke-width', (on ? w + 1.5 : w).toFixed(2));
        arrowEls[i].line.setAttribute('opacity', hover >= 0 ? (on ? '1' : '0.25') : '0.55');
      }
    }

    // Advance the model by `days` of simulated time, queueing every switch it
    // realises at the moment of simulated time it happened.
    function advance(days) {
      const target = market.t + days;
      let guard = 0;
      while (market.t < target && guard++ < 20000) {
        const o = market.nPlus, m = market.nMinus;
        const win = market.step();
        if (win < 0 || win > 5) continue;
        // A switch that would break a population floor is void in the model.
        if (market.nPlus === o && market.nMinus === m) continue;
        pending.push({ at: market.t, s: SWITCHES[win] });
      }
    }

    function launch(s, instant) {
      const src = members[s.from], dst = members[s.to];
      if (!src.length) return;
      const d = src.pop();
      dst.push(d);
      switches++;
      const dot = dots[d];
      const [tx, ty] = slot(s.to, dst.length - 1);
      const arrow = geo.arrows[s.i];
      if (instant) {
        dot.key = s.to; dot.x = tx; dot.y = ty; dot.fly = null;
        dot.el.setAttribute('cx', tx.toFixed(1));
        dot.el.setAttribute('cy', ty.toFixed(1));
        dot.el.setAttribute('fill', STRATEGY[s.to].colour);
      } else {
        dot.fly = {
          t0: performance.now(), dur: speed === 'fast' ? 520 : 900,
          p0: [dot.x, dot.y], c1: [arrow.mx, arrow.my], p1: [tx, ty], to: s.to, recoloured: false,
        };
        dot.el.setAttribute('r', (Math.max(1.6, geo.spacing * 0.46) * 1.7).toFixed(2));
      }
      paintCounts();
    }

    function flyDots(now) {
      const baseR = Math.max(1.6, geo.spacing * 0.46).toFixed(2);
      for (const dot of dots) {
        const f = dot.fly;
        if (!f) continue;
        let u = Math.min(1, (now - f.t0) / f.dur);
        const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        const v = 1 - e;
        const x = v * v * f.p0[0] + 2 * v * e * f.c1[0] + e * e * f.p1[0];
        const y = v * v * f.p0[1] + 2 * v * e * f.c1[1] + e * e * f.p1[1];
        dot.el.setAttribute('cx', x.toFixed(1));
        dot.el.setAttribute('cy', y.toFixed(1));
        if (!f.recoloured && e > 0.5) {
          dot.el.setAttribute('fill', STRATEGY[f.to].colour);
          f.recoloured = true;
        }
        if (u >= 1) {
          dot.x = f.p1[0]; dot.y = f.p1[1]; dot.key = f.to; dot.fly = null;
          dot.el.setAttribute('r', baseR);
        }
      }
    }

    // --- the readouts under the figure --------------------------------------

    const gauges = ui && ui.gauges ? ui.gauges : null;
    function setGauge(name, frac, value, colour) {
      if (!gauges) return;
      const g = gauges.querySelector('[data-g="' + name + '"]');
      if (!g) return;
      const mark = g.querySelector('.gauge-mark');
      const out = g.querySelector('.gauge-value');
      const f = Math.max(0, Math.min(1, frac));
      mark.style.left = (f * 100).toFixed(1) + '%';
      if (colour) mark.style.background = colour;
      if (out.textContent !== value) out.textContent = value;
    }

    function paintGauges() {
      const nc = market.nPlus + market.nMinus;
      const x = nc ? (market.nPlus - market.nMinus) / nc : 0;
      const lag = market.trail.at(market.t - market.P.tau);
      const trend = 100 * (market.p - lag) / market.P.tau / market.p;   // % a day
      const gap = 100 * (market.p - market.pf) / market.pf;             // %
      setGauge('herd', (x + 1) / 2, (x >= 0 ? '+' : '') + x.toFixed(2),
        x >= 0 ? 'var(--optimist)' : 'var(--pessimist)');
      setGauge('trend', 0.5 + trend / 6, (trend >= 0 ? '+' : '') + trend.toFixed(2) + '% a day',
        trend >= 0 ? 'var(--optimist)' : 'var(--pessimist)');
      setGauge('gap', 0.5 + gap / 16, (gap >= 0 ? '+' : '') + gap.toFixed(1) + '%',
        'var(--fundamentalist)');
      if (ui && ui.clock) {
        const t = market.t;
        const day = Math.floor(t);
        const mins = Math.floor((t - day) * 1440);
        ui.clock.textContent = 'simulated day ' + day + ', ' +
          String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0') +
          ' · ' + switches.toLocaleString('en') + ' switches · price ' + market.p.toFixed(1) +
          ', fundamental ' + market.pf.toFixed(1);
      }
    }

    function explain() {
      if (!ui || !ui.explain) return;
      const box = ui.explain;
      box.replaceChildren();
      if (hover < 0) {
        box.textContent = 'Point at an arrow, or tab to it, to see what drives that switch ' +
          'and how often it is firing right now. Thicker arrows are firing faster.';
        return;
      }
      const s = SWITCHES[hover];
      const b = document.createElement('b');
      b.textContent = SYMBOLS[s.i] + ' — ' + s.label + '. ';
      box.appendChild(b);
      const perHour = rateBuf[s.i] * CROWD_N * HOUR;
      box.appendChild(document.createTextNode(s.why + ' In the market as it stands, this happens about ' +
        (perHour >= 10 ? Math.round(perHour) : perHour.toFixed(1)) + ' times a simulated hour.'));
    }

    // --- the loop -----------------------------------------------------------

    let last = 0, simClock = 0, lastExplain = 0;
    // A frame is requested from requestAnimationFrame with a timer racing it.
    // A background or occluded tab may deliver no animation frames at all, and
    // a loop that waits only on them would latch and never resume.
    let scheduled = false, rafId = 0, timerId = 0;
    function schedule() {
      if (scheduled) return;
      scheduled = true;
      const tick = () => {
        if (!scheduled) return;
        scheduled = false;
        cancelAnimationFrame(rafId);
        clearTimeout(timerId);
        frameLoop(performance.now());
      };
      rafId = requestAnimationFrame(tick);
      timerId = setTimeout(tick, 50);
    }

    function frameLoop(now) {
      if (!running || !visible) return;
      if (!last) { last = now; simClock = Math.max(simClock, market.t - SPEEDS[speed] * 0.25); }
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      // Keep the model a little ahead of what is being shown, then replay the
      // queued switches as the display clock passes the time each happened.
      simClock += dt * SPEEDS[speed];
      if (market.t < simClock + SPEEDS[speed] * 0.25) advance(SPEEDS[speed] * 0.25);
      let flying = 0;
      for (const d of dots) if (d.fly) flying++;
      while (pending.length && pending[0].at <= simClock) {
        const p = pending.shift();
        // When the crowd is in a rush, the excess lands without a flight.
        launch(p.s, reduceMotion || flying++ > 24);
      }
      flyDots(now);
      readRates(false);
      paintArrows();
      paintGauges();
      if (hover >= 0 && now - lastExplain > 400) { lastExplain = now; explain(); }
      schedule();
    }

    function kick() {
      if (running && visible && !scheduled) { last = 0; schedule(); }
    }

    function setRunning(on) {
      running = on;
      if (ui && ui.toggle) {
        ui.toggle.textContent = on ? 'Pause' : 'Play';
        ui.toggle.setAttribute('aria-pressed', String(on));
      }
      if (on) kick();
    }

    // Deliver everything already computed at once, e.g. before a reset or a
    // news shock, so the dots and the counts agree with the model again.
    function flush() {
      while (pending.length) launch(pending.shift().s, true);
      for (const d of dots) if (d.fly) {
        d.fly.t0 = 0; d.fly.dur = 1; // lands on the next frame
      }
      simClock = market.t;
    }

    newMarket();
    register(node, draw);
    explain();
    paintGauges();

    if (ui && ui.toggle) ui.toggle.addEventListener('click', () => setRunning(!running));
    if (ui && ui.speed) {
      ui.speed.addEventListener('click', () => {
        speed = speed === 'watch' ? 'fast' : 'watch';
        ui.speed.setAttribute('aria-pressed', String(speed === 'fast'));
        simClock = Math.min(simClock, market.t);
      });
    }
    if (ui && ui.reset) {
      ui.reset.addEventListener('click', () => {
        newMarket();
        assignAll();
        readRates(true);
        paintArrows();
        paintGauges();
        explain();
        simClock = market.t; last = 0;
      });
    }
    // News moves the fundamental value, never the price: this is thirty of the
    // model's own news events (β₉ or β₁₀) arriving at once, and the crowd then
    // responds to the gap by its own rules.
    const news = (sign) => () => {
      flush();
      market.pf = Math.max(1, market.pf + sign * 30 * market.P.tick);
      readRates(true);
      paintGauges();
      if (!running) setRunning(true);
    };
    if (ui && ui.good) ui.good.addEventListener('click', news(+1));
    if (ui && ui.bad) ui.bad.addEventListener('click', news(-1));
    if (ui && ui.herd) {
      ui.herd.addEventListener('input', () => {
        a1 = parseFloat(ui.herd.value);
        market.P.a1 = a1;
        if (ui.herdOut) ui.herdOut.textContent = a1.toFixed(2);
      });
    }

    // Under reduced motion it waits for Play. The observer only pauses it while
    // it is off screen; it is not what starts it, so a browser that never
    // reports an intersection still gets a running figure.
    visible = true;
    setRunning(!reduceMotion);
    if ('IntersectionObserver' in global) {
      new IntersectionObserver((entries) => {
        for (const e of entries) {
          visible = e.isIntersecting;
          if (visible) kick();
        }
      }, { threshold: 0 }).observe(node);
    }
  }

  // =======================================================================
  // The ten competing clocks
  // =======================================================================

  function clockRace(node, statusEl, buttons) {
    const rates = (global.MICRO && global.MICRO.race ? global.MICRO.race : []).map((r) => r.rate);
    let draws = rates.map(() => 0);
    let winner = -1;
    let clock = [];           // the accumulated winning intervals
    let announced = '';

    function roll(initial) {
      draws = rates.map((rate) => (rate > 0 ? -Math.log(Math.random() || 1e-12) / rate : Infinity));
      let best = Infinity;
      winner = -1;
      draws.forEach((d, i) => { if (d < best) { best = d; winner = i; } });
      clock.push(best);
      if (clock.length > 24) clock.shift();
      announced = `${SYMBOLS[winner]}, ${LABELS[winner]}, won with a wait of ` +
        `${fmt(best)}. The clock advanced by that much; the other nine were discarded.`;
      if (statusEl) {
        statusEl.replaceChildren();
        const b = document.createElement('b');
        b.textContent = SYMBOLS[winner] + ' — ' + LABELS[winner];
        statusEl.appendChild(b);
        statusEl.appendChild(document.createTextNode(
          ` won with a waiting time of ${fmt(best)} of simulated trading. The clock advanced by exactly that much; the other nine waiting times were thrown away and drawn again.`));
      }
      if (!initial) C.redrawAll();
    }

    // Waiting times run from a few seconds to a couple of days of simulated
    // trading. Scientific notation is exact and unreadable; a human unit says
    // the same thing and makes the spread between the ten bars mean something.
    function fmt(v) {
      const sec = v * 24 * 3600;
      if (sec < 90) return sec.toFixed(sec < 10 ? 1 : 0) + ' seconds';
      if (sec < 5400) return (sec / 60).toFixed(sec < 600 ? 1 : 0) + ' minutes';
      if (v < 2) return (v * 24).toFixed(1) + ' hours';
      return v.toFixed(2) + ' days';
    }

    // The first race is drawn before the figure is registered, so that the
    // figure never renders once with ten empty waiting times.
    roll(true);

    register(node, function () {
      const H = 380;
      const { svg, W } = frame(node, H);
      const narrow = W < 600;
      const L = narrow ? 112 : Math.min(210, Math.max(150, W * 0.3));
      const R = narrow ? 14 : 70;
      const T = 16;
      const rowH = 22;
      const chartBottom = T + 10 * rowH;

      const finite = draws.filter(Number.isFinite);
      const max = finite.length ? Math.max.apply(null, finite) : 0;
      const min = finite.length ? Math.min.apply(null, finite) : 0;

      // Bar length is logarithmic. The ten waiting times routinely differ by a
      // factor of several hundred — news arrives rarely, opinions change
      // constantly — so on a linear scale the six switching events collapse
      // into the axis and the race between them cannot be seen. A log scale
      // preserves the ordering, which is all the rule depends on.
      const span = max > 0 && min > 0 ? Math.log(max / min) : 0;
      const barLen = (d) => {
        const full = W - L - R;
        if (!(span > 0)) return full;
        return Math.max(4, (Math.log(d / min) / span) * (full - 4) + 4);
      };

      const g = el('g');
      for (let i = 0; i < 10; i++) {
        const y = T + i * rowH;
        const won = i === winner;
        if (won) {
          g.appendChild(el('rect', {
            x: 0, y: y + 1, width: W, height: rowH - 2, rx: 2,
            fill: 'var(--highlight)', opacity: 0.12,
          }));
        }
        g.appendChild(text(SYMBOLS[i], { x: 4, y: y + 14, class: 'clocklabel', fill: won ? 'var(--ink)' : 'var(--ink-mute)' }));
        g.appendChild(text(narrow ? SHORT[i] : LABELS[i], {
          x: 30, y: y + 14, class: 'annot',
          fill: won ? 'var(--ink)' : 'var(--ink-mute)',
          'font-weight': won ? '600' : '400',
        }));
        const d = draws[i];
        if (Number.isFinite(d) && max > 0) {
          const w = barLen(d);
          g.appendChild(el('rect', {
            x: L, y: y + 5, width: w, height: rowH - 10, rx: 1,
            fill: won ? 'var(--highlight)' : 'var(--rule-strong)',
            opacity: won ? 1 : 0.45,
          }));
          if (won && !narrow) {
            g.appendChild(text(fmt(d), {
              x: L + w + 7, y: y + 14, class: 'annot', fill: 'var(--highlight)', 'font-weight': '600',
            }));
          }
        } else {
          g.appendChild(text(narrow ? 'rate zero' : 'rate zero in this state', {
            x: L + 2, y: y + 14, class: 'annot', 'font-style': 'italic',
          }));
        }
      }

      if (winner >= 0 && max > 0 && Number.isFinite(draws[winner])) {
        const x = L + barLen(draws[winner]);
        g.appendChild(el('line', {
          x1: x, x2: x, y1: T, y2: chartBottom + 4,
          stroke: 'var(--highlight)', 'stroke-width': 1, 'stroke-dasharray': '2 3',
        }));
        g.appendChild(text(W < 600
          ? 'shortest wins · bars are logarithmic'
          : 'the shortest wins — everything to the right of it is discarded and drawn again', {
          x: 4, y: chartBottom + 18, class: 'annot', fill: 'var(--ink-mute)',
        }));
        if (W >= 600) {
          g.appendChild(text(
            'bar length is logarithmic: the longest wait here is ' +
            Math.round(max / min).toLocaleString('en') + ' times the shortest',
            { x: 4, y: chartBottom + 33, class: 'annot', fill: 'var(--ink-mute)' }));
        }
      }

      // Lower panel: the internal clock, advanced by each winning interval.
      const cy = chartBottom + 78;
      g.appendChild(text('the market’s internal clock', { x: 4, y: cy - 16, class: 'annot' }));
      g.appendChild(el('line', { x1: 4, x2: W - 8, y1: cy, y2: cy, stroke: 'var(--rule-strong)', 'stroke-width': 1 }));
      const total = clock.reduce((a, b) => a + b, 0) || 1;
      let acc = 0;
      for (let i = 0; i < clock.length; i++) {
        acc += clock[i];
        const x = 4 + (acc / total) * (W - 16);
        g.appendChild(el('line', {
          x1: x, x2: x, y1: cy - 9, y2: cy + 9,
          stroke: i === clock.length - 1 ? 'var(--highlight)' : 'var(--ink-mute)',
          'stroke-width': i === clock.length - 1 ? 2 : 1,
        }));
      }
      g.appendChild(text(
        clock.length > 1
          ? clock.length + ' events so far — the gaps between them are not equal'
          : 'draw again to advance the clock',
        { x: 4, y: cy + 26, class: 'annot' }));

      svg.appendChild(g);
      svg.appendChild(el('title', {}, [document.createTextNode(
        announced || 'Ten horizontal bars, one for each possible event, each showing a randomly drawn waiting time.')]));
    });

    if (buttons.draw) buttons.draw.addEventListener('click', function () { roll(); });
    if (buttons.reset) {
      buttons.reset.addEventListener('click', function () {
        clock = [];
        roll();
      });
    }
  }

  // =======================================================================
  // Business time against calendar time
  // =======================================================================

  // The eleven event times of the chapter's Figure 2.1, lower panel, read off
  // the original scan and normalised to the width of its axis.
  const FIG21_TIMES = [0.061, 0.162, 0.242, 0.362, 0.404, 0.463, 0.591, 0.688, 0.797, 0.920, 1.0];

  function businessTime(node) {
    register(node, function () {
      const W = C.widthOf(node);
      const stacked = W < 640;
      const panelW = stacked ? W : (W - 28) / 2;
      const panelH = 300;
      const H = stacked ? panelH * 2 + 40 : panelH;
      const { svg } = frame(node, H);

      drawStaircase(svg, 0, 0, panelW, panelH,
        FIG21_TIMES, 'The chapter’s schematic', 'calendar time', true);

      const ev = (global.MICRO && global.MICRO.events) || [];
      const take = ev.slice(0, 11).map((e) => e.t);
      const span = take.length ? take[take.length - 1] : 1;
      drawStaircase(svg,
        stacked ? 0 : panelW + 28, stacked ? panelH + 40 : 0,
        panelW, panelH,
        take.map((t) => t / span), 'The same thing, from a run',
        `calendar time — ${span ? span.toFixed(2) : ''} hours in total`, false);

      svg.appendChild(el('title', {}, [document.createTextNode(
        'Two staircases of business time against calendar time. Each step up is ' +
        'one further event; each step across is how long that event happened to ' +
        'take. The steps are of visibly unequal width in both panels.')]));
    });
  }

  function drawStaircase(svg, ox, oy, W, H, times, title, xlabel, schematic) {
    const L = schematic ? 56 : 32, R = 14, T = 42, B = 56;
    const g = el('g', { transform: `translate(${ox},${oy})` });
    const n = times.length;

    const X = (t) => L + t * (W - L - R);
    const Y = (i) => T + (1 - i / n) * (H - T - B);

    g.appendChild(text(title, { x: 0, y: 12, class: 'serieslabel', fill: 'var(--ink-soft)' }));

    // Axes.
    g.appendChild(el('line', { x1: L, x2: L, y1: T - 4, y2: H - B, stroke: 'var(--rule-strong)', 'stroke-width': 1 }));
    g.appendChild(el('line', { x1: L, x2: W - R, y1: H - B, y2: H - B, stroke: 'var(--rule-strong)', 'stroke-width': 1 }));

    for (let i = 1; i <= n; i++) {
      if (n > 6 && i % 2 === 0 && !schematic) { /* keep labels sparse */ }
      g.appendChild(el('line', { x1: L - 3, x2: L, y1: Y(i), y2: Y(i), stroke: 'var(--rule-strong)' }));
      if (i % (n > 11 ? 2 : 1) === 0 || i === 1) {
        g.appendChild(text(schematic ? 'tick ' + i : String(i), {
          x: L - 7, y: Y(i) + 3.5, class: 'axis', 'text-anchor': 'end', fill: 'var(--ink-mute)',
        }));
      }
      g.appendChild(el('line', { x1: X(times[i - 1]), x2: X(times[i - 1]), y1: H - B, y2: H - B + 4, stroke: 'var(--rule-strong)' }));
    }

    // The staircase itself.
    const pts = [[X(0), Y(0)]];
    for (let i = 1; i <= n; i++) {
      pts.push([X(times[i - 1]), Y(i - 1)]);
      pts.push([X(times[i - 1]), Y(i)]);
    }
    g.appendChild(el('path', { d: path(pts), fill: 'none', stroke: 'var(--price)', 'stroke-width': 1.8, 'stroke-linejoin': 'miter' }));

    for (let i = 1; i <= n; i++) {
      g.appendChild(el('circle', { cx: X(times[i - 1]), cy: Y(i), r: 2.6, fill: 'var(--price)' }));
    }

    // Label the widest and narrowest steps, since the inequality is the point.
    let widest = 0, narrowest = 0, wv = -1, nv = Infinity;
    for (let i = 0; i < n; i++) {
      const w = times[i] - (i ? times[i - 1] : 0);
      if (w > wv) { wv = w; widest = i; }
      if (w < nv) { nv = w; narrowest = i; }
    }
    const wx = (X(widest ? times[widest - 1] : 0) + X(times[widest])) / 2;
    g.appendChild(text('longest wait', {
      x: wx, y: Math.max(T + 4, Y(widest + 1) - 8),
      class: 'annot', 'text-anchor': 'middle', fill: 'var(--highlight)',
    }));
    const nx = X(times[narrowest]);
    g.appendChild(text('shortest', { x: nx + 4, y: Y(narrowest + 1) + 13, class: 'annot', fill: 'var(--highlight)' }));

    g.appendChild(text('business time, upward', { x: 0, y: 26, class: 'axis', fill: 'var(--ink-mute)' }));
    if (schematic) {
      for (let i = 1; i <= n; i++) {
        g.appendChild(text('t' + sub(i), { x: X(times[i - 1]), y: H - B + 17, class: 'axis', 'text-anchor': 'middle' }));
      }
    }
    g.appendChild(text(xlabel, { x: L, y: H - B + 36, class: 'axis' }));
    svg.appendChild(g);
  }

  function sub(i) {
    const map = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
    return String(i).split('').map((c) => map[c]).join('');
  }

  // =======================================================================
  // Excess demand and the tick
  // =======================================================================

  function tickFigure(node, buttons) {
    // A deliberately small, legible hand-run of the pricing rule: orders
    // accumulate into an imbalance, the market maker acts, and the price moves
    // by exactly one tick toward it. The numbers are a miniature of the model —
    // twenty traders rather than four hundred — so that a single order visibly
    // moves the bar.
    const NF = 10, TC = 0.1, TF = 3, TICK = 0.1, FAIR = 100.4;
    let state, history, last;

    function reset() {
      state = { opt: 9, pess: 7, price: 99.8, step: 0 };
      history = [state.price];
      last = null;
      // A few steps already taken, so the panel opens as a chart rather than
      // as a single dot.
      for (let i = 0; i < 7; i++) advance(true);
      C.redrawAll();
    }

    const chartistED = (s) => (s.opt - s.pess) * TC;
    const fundED = (s) => NF * TF * (FAIR - s.price) / s.price;
    const totalED = (s) => chartistED(s) + fundED(s);

    function advance(quiet) {
      if (state.step % 2 === 0) {
        // An order arrives: one trader changes side.
        const drift = 0.5 + 0.22 * Math.sign(FAIR - state.price);
        if (Math.random() < drift) { state.opt++; state.pess = Math.max(0, state.pess - 1); }
        else { state.pess++; state.opt = Math.max(0, state.opt - 1); }
        last = 'order';
      } else {
        const ed = totalED(state);
        state.price = Math.round((state.price + (ed > 0 ? TICK : -TICK)) * 10) / 10;
        history.push(state.price);
        if (history.length > 22) history.shift();
        last = ed > 0 ? 'up' : 'down';
      }
      state.step++;
      if (!quiet) C.redrawAll();
    }

    register(node, function () {
      if (!state) reset();
      const H = 280;
      const { svg, W } = frame(node, H);
      const g = el('g');

      const split = Math.round(Math.min(0.46, Math.max(0.36, 300 / W)) * W);
      const gap = 34;

      // ---- left: what reaches the market maker ---------------------------
      const zero = Math.round(split * 0.52);
      const rowY = [86, 122, 170];
      const scale = Math.min(120, (split - zero - 40) / 1.6);
      const cap = (v) => Math.max(-(zero - 8), Math.min(split - zero - 30, v * scale));

      g.appendChild(text('orders reaching the market maker', { x: 0, y: 24, class: 'serieslabel', fill: 'var(--ink-soft)' }));
      g.appendChild(el('line', { x1: zero, x2: zero, y1: 56, y2: 196, stroke: 'var(--rule-strong)' }));
      g.appendChild(text('0', { x: zero, y: 210, class: 'axis', 'text-anchor': 'middle' }));

      const parts = [
        { label: 'chartists', v: chartistED(state), colour: chartistED(state) >= 0 ? 'var(--optimist)' : 'var(--pessimist)', h: 18 },
        { label: 'fundamentalists', v: fundED(state), colour: 'var(--fundamentalist)', h: 18 },
        { label: 'excess demand', v: totalED(state), colour: 'var(--price)', h: 24 },
      ];
      parts.forEach((p, i) => {
        const y = rowY[i];
        const len = cap(p.v);
        g.appendChild(text(p.label, { x: 0, y: y - 6, class: 'annot' }));
        g.appendChild(el('rect', {
          x: len >= 0 ? zero : zero + len, y: y,
          width: Math.max(1.5, Math.abs(len)), height: p.h, rx: 1,
          fill: p.colour, opacity: i === 2 ? 0.95 : 0.6,
        }));
        g.appendChild(text((p.v >= 0 ? '+' : '') + p.v.toFixed(2), {
          x: zero + (len >= 0 ? len + 6 : len - 6), y: y + p.h - 5,
          class: 'annot', 'text-anchor': len >= 0 ? 'start' : 'end',
          fill: i === 2 ? 'var(--ink)' : 'var(--ink-mute)',
        }));
      });
      g.appendChild(el('line', { x1: 0, x2: split - 20, y1: 158, y2: 158, stroke: 'var(--rule)' }));

      g.appendChild(text(state.opt + ' optimists · ' + state.pess + ' pessimists · ' + NF + ' fundamentalists', {
        x: 0, y: 236, class: 'annot',
      }));
      g.appendChild(text(
        state.step % 2 === 0 ? 'next step: an order arrives' : 'next step: the market maker revises the quote',
        { x: 0, y: 254, class: 'annot', fill: 'var(--highlight)' }));

      // ---- right: the quote ----------------------------------------------
      const L2 = split + gap, R2 = 12, T2 = 56, B2 = 210;
      g.appendChild(text('the quote', { x: L2, y: 24, class: 'serieslabel', fill: 'var(--ink-soft)' }));

      const lo = Math.min(Math.min.apply(null, history), FAIR) - 0.12;
      const hi = Math.max(Math.max.apply(null, history), FAIR) + 0.12;
      const X = (i) => L2 + (i / Math.max(1, history.length - 1)) * (W - L2 - R2);
      const Y = (v) => T2 + (1 - (v - lo) / (hi - lo)) * (B2 - T2);

      for (let v = Math.ceil(lo * 10) / 10; v <= hi; v = Math.round((v + 0.1) * 10) / 10) {
        g.appendChild(el('line', { x1: L2, x2: W - R2, y1: Y(v), y2: Y(v), class: 'gridline' }));
      }
      g.appendChild(el('line', {
        x1: L2, x2: W - R2, y1: Y(FAIR), y2: Y(FAIR),
        stroke: 'var(--fundamental)', 'stroke-width': 1.4, 'stroke-dasharray': '4 3',
      }));
      g.appendChild(text('fundamental value', {
        x: L2 + 4, y: Y(FAIR) - 6, class: 'annot', fill: 'var(--fundamental)',
      }));

      const pts = [];
      for (let i = 0; i < history.length; i++) {
        pts.push([X(i), Y(history[i])]);
        if (i < history.length - 1) pts.push([X(i + 1), Y(history[i])]);
      }
      g.appendChild(el('path', { d: path(pts), fill: 'none', stroke: 'var(--price)', 'stroke-width': 1.8 }));
      g.appendChild(el('circle', { cx: X(history.length - 1), cy: Y(state.price), r: 3.2, fill: 'var(--price)' }));
      g.appendChild(text(state.price.toFixed(1), {
        x: X(history.length - 1) - 7, y: Y(state.price) + 16,
        class: 'serieslabel', fill: 'var(--price)', 'text-anchor': 'end',
      }));
      g.appendChild(text('one tick = 0.1 — nothing moves the price by more than that at once', {
        x: L2, y: 236, class: 'annot',
      }));
      if (last === 'up' || last === 'down') {
        g.appendChild(text('last move: one tick ' + last + ', toward the imbalance', {
          x: L2, y: 254, class: 'annot', fill: 'var(--price)',
        }));
      } else {
        g.appendChild(text('an order arrived; the quote has not moved yet', {
          x: L2, y: 254, class: 'annot',
        }));
      }

      svg.appendChild(g);
      svg.appendChild(el('title', {}, [document.createTextNode(
        'Two panels. On the left, three bars: the chartists\u2019 net order, the ' +
        'fundamentalists\u2019 response to the mispricing, and their sum, the excess ' +
        'demand. On the right, the quoted price, moving by one tick of 0.1 ' +
        'toward that imbalance whenever the market maker acts.')]));
    });

    if (buttons.step) buttons.step.addEventListener('click', function () { advance(false); });
    if (buttons.reset) buttons.reset.addEventListener('click', reset);
  }

  global.Figures = { strategyDiagram, clockRace, businessTime, tickFigure };
})(window);
