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
  // The three strategies
  // =======================================================================

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

  function strategyDiagram(node) {
    register(node, function () {
      const H = 430;
      const { svg, W } = frame(node, H);
      const cx = W / 2;
      const nodes = {
        opt: { x: Math.max(90, cx - Math.min(280, W * 0.3)), y: 88, colour: 'var(--optimist)', name: 'Optimistic chartists', sub: 'expect a rise — they buy' },
        pess: { x: Math.min(W - 90, cx + Math.min(280, W * 0.3)), y: 88, colour: 'var(--pessimist)', name: 'Pessimistic chartists', sub: 'expect a fall — they sell' },
        fund: { x: cx, y: 250, colour: 'var(--fundamentalist)', name: 'Fundamentalists', sub: 'trade the gap to fair value' },
      };

      const defs = el('defs');
      for (const key in nodes) {
        const mk = el('marker', {
          id: 'arrow-' + key, viewBox: '0 0 10 10', refX: 9, refY: 5,
          markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse',
        }, [el('path', { d: 'M0 0 L10 5 L0 10 z', fill: nodes[key].colour })]);
        defs.appendChild(mk);
      }
      svg.appendChild(defs);

      const arrows = el('g');
      const R = 44;

      for (const s of SWITCHES) {
        const a = nodes[s.from], b = nodes[s.to];
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        const ux = dx / len, uy = dy / len;
        // Offset the two directions of each edge so they do not overlap.
        const ox = -uy, oy = ux;
        const off = 11;
        const x1 = a.x + ux * R + ox * off, y1 = a.y + uy * R + oy * off;
        const x2 = b.x - ux * (R + 7) + ox * off, y2 = b.y - uy * (R + 7) + oy * off;
        const mx = (x1 + x2) / 2 + ox * 16, my = (y1 + y2) / 2 + oy * 16;

        const d = `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
        // Focusable so that a keyboard visitor can reveal the explanation, but
        // labelled as an image rather than a button: nothing is activated, the
        // description is simply shown.
        const g = el('g', { class: 'switch-arrow', tabindex: '0', role: 'img',
          'aria-label': s.label + '. ' + s.why });
        g.appendChild(el('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': 16 }));
        const line = el('path', {
          d, fill: 'none', stroke: b.colour, 'stroke-width': 1.5, opacity: 0.55,
          'marker-end': `url(#arrow-${s.to})`,
        });
        g.appendChild(line);

        const lx = mx + ox * 8, ly = my + oy * 8;
        const sym = text(SYMBOLS[s.i], {
          x: lx, y: ly, class: 'clocklabel', 'text-anchor': 'middle',
          fill: 'var(--ink-mute)', 'font-size': 11,
        });
        g.appendChild(sym);

        g.addEventListener('mouseenter', () => show(s, line));
        g.addEventListener('focus', () => show(s, line));
        g.addEventListener('mouseleave', hide);
        g.addEventListener('blur', hide);
        arrows.appendChild(g);
      }
      svg.appendChild(arrows);

      for (const key in nodes) {
        const nd = nodes[key];
        const g = el('g');
        g.appendChild(el('circle', { cx: nd.x, cy: nd.y, r: R, fill: 'var(--bg)', stroke: nd.colour, 'stroke-width': 1.6 }));
        g.appendChild(el('circle', { cx: nd.x, cy: nd.y, r: R - 7, fill: nd.colour, opacity: 0.1 }));
        const below = key === 'fund';
        g.appendChild(text(nd.name, {
          x: nd.x, y: below ? nd.y + R + 20 : nd.y - R - 16,
          class: 'serieslabel', 'text-anchor': 'middle', fill: nd.colour,
        }));
        g.appendChild(text(nd.sub, {
          x: nd.x, y: below ? nd.y + R + 35 : nd.y - R - 2,
          class: 'annot', 'text-anchor': 'middle',
        }));
        svg.appendChild(g);
      }

      const caption = text('', {
        x: cx, y: H - 8, class: 'annot', 'text-anchor': 'middle', fill: 'var(--ink)',
      });
      svg.appendChild(caption);

      let active = null;
      function show(s, line) {
        hide();
        active = line;
        line.setAttribute('opacity', '1');
        line.setAttribute('stroke-width', '2.6');
        caption.textContent = s.label.charAt(0).toUpperCase() + s.label.slice(1) + '. ' + s.why;
        wrapCaption(caption, cx, W - 40, H);
      }
      function hide() {
        if (active) { active.setAttribute('opacity', '0.55'); active.setAttribute('stroke-width', '1.5'); }
        active = null;
        caption.textContent = '';
        caption.replaceChildren();
      }

      svg.appendChild(el('title', {}, [document.createTextNode(
        'A diagram of the three strategies — optimistic chartists, pessimistic ' +
        'chartists and fundamentalists — joined by six arrows, one for each way ' +
        'a trader can switch from one strategy to another.')]));
    });
  }

  // Word-wrap an SVG text node into tspans, since SVG will not do it.
  function wrapCaption(node, cx, maxWidth, H) {
    const words = node.textContent.split(' ');
    node.textContent = '';
    const perLine = Math.max(6, Math.floor(maxWidth / 6.4));
    const lines = [];
    let line = '';
    for (const w of words) {
      if ((line + ' ' + w).trim().length > perLine) { lines.push(line.trim()); line = w; }
      else line += ' ' + w;
    }
    if (line.trim()) lines.push(line.trim());
    const start = H - 8 - (lines.length - 1) * 13;
    lines.forEach((l, i) => {
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      t.setAttribute('x', cx);
      t.setAttribute('y', start + i * 13);
      t.textContent = l;
      node.appendChild(t);
    });
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
