/* charts.js — the five figures of the results gallery.
   Hand-rolled SVG, except the 2,500-spike return plot, which is canvas.
   Every chart is rebuilt at the container's real pixel width so that labels
   stay legible from 360px up, and colours come from CSS custom properties so
   both themes are handled without a second palette. */

(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  // --- small helpers -----------------------------------------------------

  function el(name, attrs, children) {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) {
      if (attrs[k] === null || attrs[k] === undefined) continue;
      // A non-finite number would be rejected by the SVG parser with a console
      // error and an element that silently does not draw; dropping it here
      // fails visibly instead.
      if (typeof attrs[k] === 'number' && !Number.isFinite(attrs[k])) continue;
      n.setAttribute(k, attrs[k]);
    }
    if (children) for (const c of [].concat(children)) if (c) n.appendChild(c);
    return n;
  }

  function text(str, attrs) {
    const n = el('text', attrs);
    n.textContent = str;
    return n;
  }

  function niceTicks(lo, hi, count) {
    const span = hi - lo;
    if (!(span > 0)) return [lo];
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
      out.push(Number(v.toFixed(10)));
    }
    return out;
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function path(points) {
    let d = '';
    for (let i = 0; i < points.length; i++) {
      d += (i ? 'L' : 'M') + points[i][0].toFixed(1) + ' ' + points[i][1].toFixed(1);
    }
    return d;
  }

  // A chart registry so every figure can be redrawn on resize and on a theme
  // change without each call site having to remember to do it.
  const registry = [];
  function register(node, draw) {
    registry.push({ node, draw });
    draw();
  }
  function redrawAll() { for (const r of registry) r.draw(); }

  let resizeTimer = null;
  global.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(redrawAll, 160);
  });

  function widthOf(node, fallback) {
    const w = node.clientWidth || node.getBoundingClientRect().width;
    return Math.max(320, Math.round(w || fallback || 720));
  }

  function frame(node, height, describedBy) {
    const W = widthOf(node);
    const svg = el('svg', {
      viewBox: `0 0 ${W} ${height}`,
      width: W,
      height: height,
      role: 'img',
      'aria-labelledby': describedBy || null,
      style: 'width:100%;height:auto',
    });
    node.replaceChildren(svg);
    return { svg, W, H: height };
  }

  // --- 1. price and fundamental ------------------------------------------

  function priceChart(node, run, derived) {
    register(node, function () {
      const H = 320;
      const { svg, W } = frame(node, H);
      const L = 46, R = 16, T = 24, B = 30;
      const price = run.price, fund = run.fundamental;
      const n = price.length;

      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < n; i++) {
        lo = Math.min(lo, price[i], fund[i]);
        hi = Math.max(hi, price[i], fund[i]);
      }
      const pad = (hi - lo) * 0.08;
      lo -= pad; hi += pad;

      const X = (i) => L + (i / (n - 1)) * (W - L - R);
      const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);

      const g = el('g');

      // Shaded turbulent stretches, behind everything.
      for (const c of derived.clusters) {
        g.appendChild(el('rect', {
          x: X(c.from), y: T, width: Math.max(2, X(c.to) - X(c.from)), height: H - T - B,
          fill: 'var(--shade)',
        }));
      }
      if (derived.clusters.length) {
        const c = derived.clusters[0];
        g.appendChild(text('volatility clusters here', {
          x: X(c.to) + 6, y: T + 13, class: 'annot',
        }));
      }

      // Axes.
      for (const v of niceTicks(lo, hi, 4)) {
        g.appendChild(el('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: 'gridline' }));
        g.appendChild(text(v.toFixed(0), { x: L - 8, y: Y(v) + 3.5, class: 'axis', 'text-anchor': 'end', fill: 'var(--ink-mute)' }));
      }
      for (const d of [0, 500, 1000, 1500, 2000, 2500]) {
        if (d > n) continue;
        g.appendChild(text(String(d), { x: X(Math.min(d, n - 1)), y: H - 22, class: 'axis', 'text-anchor': d === 0 ? 'start' : 'middle' }));
      }
      g.appendChild(text('simulated day', { x: (L + W - R) / 2, y: H - 6, class: 'axis', 'text-anchor': 'middle' }));

      const fpts = [], ppts = [];
      for (let i = 0; i < n; i++) { fpts.push([X(i), Y(fund[i])]); ppts.push([X(i), Y(price[i])]); }

      // The price is drawn first and lightly: it is the noisy series. The
      // fundamental goes on top, because it is the thing the price moves
      // around and it would otherwise be buried underneath.
      g.appendChild(el('path', { d: path(ppts), fill: 'none', stroke: 'var(--price)', 'stroke-width': 1, opacity: 0.8 }));
      g.appendChild(el('path', { d: path(fpts), fill: 'none', stroke: 'var(--fundamental)', 'stroke-width': 2, 'stroke-dasharray': '5 3' }));

      // Direct labels rather than a legend, placed where the two series are
      // furthest apart so that neither label sits on the other's line.
      let sep = 0, at = Math.floor(n / 2);
      for (let i = 60; i < n - 60; i++) {
        const d = Math.abs(price[i] - fund[i]);
        if (d > sep) { sep = d; at = i; }
      }
      const above = price[at] > fund[at];
      g.appendChild(text('market price', {
        x: X(at), y: Y(price[at]) + (above ? -9 : 17),
        class: 'serieslabel', fill: 'var(--price)', 'text-anchor': 'middle',
      }));
      g.appendChild(text('fundamental value', {
        x: X(at), y: Y(fund[at]) + (above ? 17 : -9),
        class: 'serieslabel', fill: 'var(--fundamental)', 'text-anchor': 'middle',
      }));

      svg.appendChild(g);
      svg.appendChild(el('title', {}, [document.createTextNode(
        'The market price and the fundamental value over 2,500 simulated days. ' +
        'The price wanders around the fundamental, with the hardest movement ' +
        'concentrated in a few stretches rather than spread evenly.')]));
    });
  }

  // --- 2. returns spike plot (canvas) -------------------------------------

  function returnsSpike(canvas, ret) {
    register(canvas, function () {
      const parent = canvas.parentNode;
      const W = widthOf(parent);
      const H = 230;
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = '100%';
      canvas.style.height = H + 'px';
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const L = 46, R = 16, T = 14, B = 28;
      const n = ret.length;
      let m = 0;
      for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(ret[i]));
      m = Math.ceil(m);

      const X = (i) => L + (i / (n - 1)) * (W - L - R);
      const Y = (v) => T + (1 - (v + m) / (2 * m)) * (H - T - B);

      const muted = cssVar('--ink-mute') || '#888';
      const rule = cssVar('--rule') || '#ddd';
      const strong = cssVar('--rule-strong') || '#bbb';

      ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = muted;
      ctx.textAlign = 'right';
      for (const v of niceTicks(-m, m, 4)) {
        ctx.strokeStyle = v === 0 ? strong : rule;
        ctx.beginPath();
        ctx.moveTo(L, Y(v) + 0.5);
        ctx.lineTo(W - R, Y(v) + 0.5);
        ctx.stroke();
        ctx.fillText(v > 0 ? '+' + v : String(v), L - 8, Y(v) + 3.5);
      }

      ctx.strokeStyle = cssVar('--price') || '#1d4e6b';
      ctx.lineWidth = Math.max(0.6, (W - L - R) / n * 0.75);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = X(i);
        ctx.moveTo(x, Y(0));
        ctx.lineTo(x, Y(ret[i]));
      }
      ctx.stroke();

      ctx.fillStyle = muted;
      ctx.textAlign = 'left';
      ctx.fillText('daily return, per cent', L, H - 8);
      ctx.textAlign = 'right';
      ctx.fillText('2,500 simulated days', W - R, H - 8);
    });
  }

  // --- 3. distribution vs the normal --------------------------------------

  function distChart(node, hist) {
    register(node, function () {
      const H = 300;
      const { svg, W } = frame(node, H);
      const L = 52, R = 16, T = 22, B = 34;

      const all = hist.density.concat(hist.normal).filter((v) => v > 0);
      const loD = Math.max(Math.min.apply(null, all), 1e-5);
      const hiD = Math.max.apply(null, all);
      const lo = Math.floor(Math.log10(loD));
      const hi = Math.ceil(Math.log10(hiD));

      const X = (v) => L + ((v + 8) / 16) * (W - L - R);
      const Y = (d) => {
        const t = (Math.log10(Math.max(d, Math.pow(10, lo))) - lo) / (hi - lo);
        return T + (1 - t) * (H - T - B);
      };

      const g = el('g');
      for (let e = lo; e <= hi; e++) {
        const y = Y(Math.pow(10, e));
        g.appendChild(el('line', { x1: L, x2: W - R, y1: y, y2: y, class: 'gridline' }));
        g.appendChild(text('10' + sup(e), { x: L - 8, y: y + 3.5, class: 'axis', 'text-anchor': 'end' }));
      }
      for (const v of [-8, -6, -4, -2, 0, 2, 4, 6, 8]) {
        g.appendChild(text(v === 0 ? '0' : (v > 0 ? '+' + v : String(v)), {
          x: X(v), y: H - 16, class: 'axis', 'text-anchor': 'middle', fill: 'var(--ink-mute)',
        }));
      }
      g.appendChild(text('daily return, in standard deviations', {
        x: (L + W - R) / 2, y: H - 3, class: 'axis', 'text-anchor': 'middle', fill: 'var(--ink-mute)',
      }));

      const npts = [];
      for (let i = 0; i < hist.centres.length; i++) {
        if (hist.normal[i] <= Math.pow(10, lo)) continue;
        npts.push([X(hist.centres[i]), Y(hist.normal[i])]);
      }
      g.appendChild(el('path', { d: path(npts), fill: 'none', stroke: 'var(--secondary)', 'stroke-width': 1.4, 'stroke-dasharray': '3 3' }));

      // The observed density as a step, so that empty bins in the tails read
      // as absences rather than as interpolation, and so that the two curves
      // can be compared instead of one hiding the other.
      const half = (X(hist.centres[1]) - X(hist.centres[0])) / 2;
      // The path is broken wherever a bin is empty, so that an isolated day
      // out in the tail is not joined to its neighbours by a line implying
      // observations that are not there.
      let d = '';
      let open = false;
      for (let i = 0; i < hist.centres.length; i++) {
        if (!(hist.density[i] > 0)) { open = false; continue; }
        const x = X(hist.centres[i]), y = Y(hist.density[i]);
        d += (open ? 'L' : 'M') + (x - half).toFixed(1) + ' ' + y.toFixed(1);
        d += 'L' + (x + half).toFixed(1) + ' ' + y.toFixed(1);
        open = true;
      }
      g.appendChild(el('path', {
        d, fill: 'none', stroke: 'var(--price)', 'stroke-width': 1.7,
      }));
      // Dots on the tail bins, which a step line alone makes easy to miss.
      for (let i = 0; i < hist.centres.length; i++) {
        if (!(hist.density[i] > 0)) continue;
        if (Math.abs(hist.centres[i]) < 3.5) continue;
        g.appendChild(el('circle', {
          cx: X(hist.centres[i]).toFixed(1), cy: Y(hist.density[i]).toFixed(1),
          r: 2.2, fill: 'var(--price)',
        }));
      }

      g.appendChild(text('normal — what the textbook predicts', {
        x: X(0.4), y: Y(0.4) - 10, class: 'serieslabel', fill: 'var(--secondary)',
      }));
      g.appendChild(text('simulated returns', {
        x: X(-2.6), y: Y(2.2e-2), class: 'serieslabel', fill: 'var(--price)', 'text-anchor': 'end',
      }));

      svg.appendChild(g);
      svg.appendChild(el('title', {}, [document.createTextNode(
        'The distribution of daily returns on a logarithmic vertical axis, ' +
        'against a normal curve. The two agree near the centre; in the tails ' +
        'the normal curve falls away and the simulated returns do not.')]));
    });

    function sup(e) {
      const map = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
      return String(e).split('').map((c) => map[c] || c).join('');
    }
  }

  // --- 4. autocorrelation --------------------------------------------------

  function acfChart(node, derived) {
    register(node, function () {
      const H = 300;
      const { svg, W } = frame(node, H);
      const L = 46, R = 20, T = 22, B = 36;
      const a = derived.acfAbsRet, b = derived.acfVolume;
      const maxLag = a.length;

      let hi = 0;
      for (let i = 0; i < maxLag; i++) hi = Math.max(hi, a[i], b[i]);
      hi = Math.ceil(hi * 10) / 10;
      const lo = Math.min(0, Math.floor(Math.min.apply(null, a.concat(b)) * 10) / 10);

      const X = (k) => L + (Math.log10(k) / Math.log10(maxLag)) * (W - L - R);
      const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);

      const g = el('g');
      for (const v of niceTicks(lo, hi, 4)) {
        g.appendChild(el('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: v === 0 ? 'zeroline' : 'gridline' }));
        g.appendChild(text(v.toFixed(1), { x: L - 8, y: Y(v) + 3.5, class: 'axis', 'text-anchor': 'end', fill: 'var(--ink-mute)' }));
      }
      for (const k of [1, 2, 5, 10, 20, 50, 100, 250]) {
        if (k > maxLag) continue;
        g.appendChild(text(String(k), { x: X(k), y: H - 18, class: 'axis', 'text-anchor': 'middle', fill: 'var(--ink-mute)' }));
      }
      g.appendChild(text('lag, in trading days (logarithmic)', {
        x: (L + W - R) / 2, y: H - 4, class: 'axis', 'text-anchor': 'middle', fill: 'var(--ink-mute)',
      }));

      const pa = [], pb = [];
      for (let k = 1; k <= maxLag; k++) { pa.push([X(k), Y(a[k - 1])]); pb.push([X(k), Y(b[k - 1])]); }
      g.appendChild(el('path', { d: path(pb), fill: 'none', stroke: 'var(--secondary)', 'stroke-width': 1.5 }));
      g.appendChild(el('path', { d: path(pa), fill: 'none', stroke: 'var(--price)', 'stroke-width': 1.7 }));

      g.appendChild(text('volatility', { x: X(3), y: Y(a[2]) - 9, class: 'serieslabel', fill: 'var(--price)' }));
      g.appendChild(text('volume', { x: X(3), y: Y(b[2]) - 9, class: 'serieslabel', fill: 'var(--secondary)' }));

      svg.appendChild(g);
      svg.appendChild(el('title', {}, [document.createTextNode(
        'Autocorrelation of volatility and of volume against lag in days, on a ' +
        'logarithmic lag axis. Both decay slowly rather than dropping to zero.')]));
    });
  }

  // --- 5. volatility against volume ---------------------------------------

  function scatterChart(node, derived) {
    register(node, function () {
      const H = 300;
      const { svg, W } = frame(node, H);
      const L = 46, R = 16, T = 22, B = 38;
      const pts = derived.scatter;

      let xlo = Infinity, xhi = -Infinity, yhi = 0;
      for (const p of pts) { xlo = Math.min(xlo, p[0]); xhi = Math.max(xhi, p[0]); yhi = Math.max(yhi, p[1]); }
      const X = (v) => L + ((v - xlo) / (xhi - xlo)) * (W - L - R);
      const Y = (v) => T + (1 - v / yhi) * (H - T - B);

      const g = el('g');
      for (const v of niceTicks(0, yhi, 4)) {
        g.appendChild(el('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: 'gridline' }));
        g.appendChild(text(v.toFixed(1), { x: L - 8, y: Y(v) + 3.5, class: 'axis', 'text-anchor': 'end', fill: 'var(--ink-mute)' }));
      }
      for (const v of niceTicks(xlo, xhi, 4)) {
        g.appendChild(text(String(Math.round(v)), { x: X(v), y: H - 20, class: 'axis', 'text-anchor': 'middle', fill: 'var(--ink-mute)' }));
      }
      g.appendChild(text('daily trading volume', { x: (L + W - R) / 2, y: H - 5, class: 'axis', 'text-anchor': 'middle', fill: 'var(--ink-mute)' }));
      g.appendChild(text('absolute return, %', { x: 0, y: T - 8, class: 'axis', fill: 'var(--ink-mute)' }));

      // Every point in a single path — zero-length segments with round caps —
      // rather than one element each, which the browser then has to composite.
      let dots = '';
      for (const p of pts) {
        dots += 'M' + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1) + 'l0 0';
      }
      g.appendChild(el('path', {
        d: dots, fill: 'none', stroke: 'var(--price)', 'stroke-width': 3,
        'stroke-linecap': 'round', opacity: 0.5,
      }));

      // The fitted line, clipped to the plotted range so it does not run off
      // the bottom of the panel where the fit implies a negative return.
      const f = derived.fit;
      const fitAt = (v) => f.intercept + f.slope * v;
      let a = xlo, b = xhi;
      if (fitAt(a) < 0) a = (0 - f.intercept) / f.slope;
      if (fitAt(b) > yhi) b = (yhi - f.intercept) / f.slope;
      g.appendChild(el('line', {
        x1: X(a), y1: Y(fitAt(a)), x2: X(b), y2: Y(fitAt(b)),
        stroke: 'var(--highlight)', 'stroke-width': 1.8,
      }));

      svg.appendChild(g);
      svg.appendChild(el('title', {}, [document.createTextNode(
        'A scatter of each simulated day: trading volume on the horizontal axis ' +
        'against the size of that day’s price move on the vertical, with a ' +
        'fitted line rising left to right.')]));
    });
  }

  global.Charts = {
    priceChart, returnsSpike, distChart, acfChart, scatterChart,
    redrawAll, niceTicks, el, text, path, cssVar, register, widthOf, frame,
  };
})(window);
