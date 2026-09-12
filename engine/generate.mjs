// generate.mjs — build step. Runs the re-implemented model and writes every
// number the site plots into data/*.json.
//
//   node engine/generate.mjs
//
// Nothing on the site is computed from data at request time, and no CSV is
// shipped: the derived series (autocorrelations, histogram, scatter) are all
// precomputed here so the page only has to draw.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { Market, TABLE_2_1, UNPUBLISHED } from './model.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const ASSETS = join(ROOT, 'site', 'assets');
mkdirSync(DATA, { recursive: true });
mkdirSync(ASSETS, { recursive: true });

// The canonical run. Changing either of these changes every published figure.
const SEED = 20030601;
const DAYS = 2500;

const round = (x, d) => Number(x.toFixed(d));
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { const u = mean(a); return Math.sqrt(mean(a.map((v) => (v - u) ** 2))); };

function acf(series, maxLag) {
  const u = mean(series);
  const d = series.map((v) => v - u);
  const v0 = mean(d.map((x) => x * x));
  const out = [];
  for (let k = 1; k <= maxLag; k++) {
    let s = 0;
    for (let i = 0; i < d.length - k; i++) s += d[i] * d[i + k];
    out.push(s / (d.length - k) / v0);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. The canonical run
// ---------------------------------------------------------------------------

console.log(`running ${DAYS} simulated days, seed ${SEED} …`);
const t0 = Date.now();
const m = new Market({}, SEED);
const price = [], fundamental = [], volume = [], chartShare = [], opinion = [];

for (let day = 1; day <= DAYS; day++) {
  m.runToDay(day);
  price.push(m.p);
  fundamental.push(m.pf);
  volume.push(round(m.volume, 1));
  chartShare.push([m.nPlus, m.nMinus, m.nFund]);
  opinion.push(m.nChart > 0 ? (m.nPlus - m.nMinus) / m.nChart : 0);
  m.ticks = 0;
  m.volume = 0;
}
const totalEvents = m.events;
console.log(`  ${totalEvents.toLocaleString('en')} events in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// Daily log returns, in per cent.
const ret = [];
for (let i = 1; i < price.length; i++) ret.push(Math.log(price[i] / price[i - 1]) * 100);

const retSd = sd(ret);
const retMean = mean(ret);
const kurtosis = mean(ret.map((v) => ((v - retMean) / retSd) ** 4));

// ---------------------------------------------------------------------------
// 2. Derived series
// ---------------------------------------------------------------------------

const absRet = ret.map(Math.abs);
const volTrimmed = volume.slice(1); // align with returns

const MAXLAG = 250;
const acfRet = acf(ret, 30);
const acfAbs = acf(absRet, MAXLAG);
const acfVol = acf(volTrimmed, MAXLAG);

// Return distribution against the normal curve it is supposed to look like.
const z = ret.map((v) => (v - retMean) / retSd);
const LO = -8, HI = 8, BINS = 80, W = (HI - LO) / BINS;
const counts = new Array(BINS).fill(0);
for (const v of z) {
  const b = Math.floor((v - LO) / W);
  if (b >= 0 && b < BINS) counts[b]++;
}
const centres = [], density = [], normal = [];
for (let i = 0; i < BINS; i++) {
  const c = LO + (i + 0.5) * W;
  centres.push(round(c, 3));
  density.push(round(counts[i] / z.length / W, 6));
  normal.push(round(Math.exp(-0.5 * c * c) / Math.sqrt(2 * Math.PI), 6));
}

// Volatility against volume, one point per day, thinned for file size.
const STRIDE = 2;
const scatter = [];
for (let i = 0; i < absRet.length; i += STRIDE) {
  scatter.push([round(volTrimmed[i], 0), round(absRet[i], 3)]);
}
// Least-squares fit through the full sample, not the thinned one.
const xs = volTrimmed, ys = absRet;
const mx = mean(xs), my = mean(ys);
let sxy = 0, sxx = 0;
for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
const slope = sxy / sxx;
const intercept = my - slope * mx;
const corr = sxy / Math.sqrt(sxx * xs.length * mean(ys.map((v) => (v - my) ** 2)));

// The two most turbulent stretches, for the shaded annotations on the price
// chart. A 30-day rolling mean of absolute returns, then the two highest
// non-overlapping windows.
const WIN = 90;
const roll = [];
for (let i = 0; i + WIN <= absRet.length; i++) {
  let s = 0;
  for (let j = i; j < i + WIN; j++) s += absRet[j];
  roll.push(s / WIN);
}
const order = roll.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
const clusters = [];
for (const [, i] of order) {
  if (clusters.length === 2) break;
  if (clusters.every((c) => i + WIN < c.from - 250 || i > c.to + 250)) {
    clusters.push({ from: i + 1, to: i + WIN + 1 });
  }
}
clusters.sort((a, b) => a.from - b.from);

// ---------------------------------------------------------------------------
// 3. A short, high-resolution window: the clock and business time
// ---------------------------------------------------------------------------
//
// Section 2.2.3 and Figure 2.1. A fresh market is stepped event by event and
// every realised event is recorded with its arrival time, so the site can draw
// business time against calendar time from an actual run rather than a sketch.

const mm = new Market({}, 4242);
mm.runToDay(40); // let the composition settle away from the initial split
const t0m = mm.t;
const events = [];
const EV_SAMPLE = 400;
for (let i = 0; i < EV_SAMPLE; i++) {
  const which = mm.step();
  events.push({ t: round((mm.t - t0m) * 24, 5), e: which }); // hours since start
}

// The ten jump rates of one settled market state, for the clock-race figure.
// Only the rates are published: the waiting times themselves are drawn live in
// the page each time the visitor asks for another race, so there is nothing to
// record here, and drawing them at build time would make the output differ from
// one build to the next.
const race = [];
{
  const mr = new Market({}, 99);
  mr.runToDay(40);
  const b = mr.rates(new Float64Array(10));
  for (let i = 0; i < 10; i++) race.push({ rate: round(mr.n * b[i], 5) });
}

// ---------------------------------------------------------------------------
// 4. Write
// ---------------------------------------------------------------------------

const provenance = {
  note: 'Generated by a 2026 re-implementation of the 2003 model. Not extracted from the original paper.',
  seed: SEED,
  days: DAYS,
  events: totalEvents,
  command: 'node engine/generate.mjs',
  generated: new Date().toISOString().slice(0, 10),
};

const SITEDATA = join(ROOT, 'site', 'data');
mkdirSync(SITEDATA, { recursive: true });

// Each payload is written twice: as JSON in data/, which is the archival copy,
// and as a one-line script in site/data/, which assigns the identical object to
// a global. The second form is what the page loads, so that the site also works
// when the files are opened straight from disk, where fetch() is not allowed.
function emit(name, globalName, payload) {
  const json = JSON.stringify(payload);
  writeFileSync(join(DATA, `${name}.json`), json);
  writeFileSync(join(SITEDATA, `${name}.js`), `window.${globalName}=${json};
`);
  return json.length;
}

let bytes = 0;
bytes += emit('run', 'RUN', {
  provenance,
  params: { published: TABLE_2_1, unpublished: UNPUBLISHED },
  price: price.map((v) => round(v, 2)),
  fundamental: fundamental.map((v) => round(v, 2)),
  volume,
  ret: ret.map((v) => round(v, 3)),
  opinion: opinion.map((v) => round(v, 3)),
  share: chartShare.filter((_, i) => i % 5 === 0),
});

bytes += emit('derived', 'DERIVED', {
  provenance,
  stats: {
    retSd: round(retSd, 4),
    kurtosis: round(kurtosis, 3),
    retMin: round(Math.min(...ret), 3),
    retMax: round(Math.max(...ret), 3),
    corrVolVolume: round(corr, 3),
    eventsPerDay: Math.round(totalEvents / DAYS),
    mispricingSd: round(sd(price.map((p, i) => 100 * (p - fundamental[i]) / fundamental[i])), 3),
  },
  acfRet: acfRet.map((v) => round(v, 4)),
  acfAbsRet: acfAbs.map((v) => round(v, 4)),
  acfVolume: acfVol.map((v) => round(v, 4)),
  hist: { centres, density, normal },
  scatter,
  fit: { slope: round(slope, 6), intercept: round(intercept, 4) },
  clusters,
});

bytes += emit('microstructure', 'MICRO', {
  provenance: { ...provenance, seed: 4242, note: provenance.note },
  events,
  race,
});

console.log(`  payload ${(bytes / 1024).toFixed(0)} KB`);

// ---------------------------------------------------------------------------
// 5. Static assets: the reduced-motion hero still, and the Open Graph image
// ---------------------------------------------------------------------------

// A short run, drawn as an inline SVG, shown wherever the live hero animation
// must not run (prefers-reduced-motion, or a device too slow to keep up).
{
  const hero = new Market({ N: 200 }, 777);
  const hp = [], hf = [];
  for (let d = 1; d <= 220; d++) { hero.runToDay(d); hp.push(hero.p); hf.push(hero.pf); }
  const W = 760, H = 220, PAD = 8;
  const all = hp.concat(hf);
  const lo = Math.min(...all), hi = Math.max(...all), span = (hi - lo) || 1;
  const path = (a) => a.map((v, i) => {
    const x = PAD + (i / (a.length - 1)) * (W - 2 * PAD);
    const y = PAD + (1 - (v - lo) / span) * (H - 2 * PAD);
    return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join('');
  // The still is shown through an <img>, so the page's custom properties do not
  // reach it. It carries its own palette, including the dark one, matching the
  // tokens in site/styles.css.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="A still frame of the simulation: the market price wandering around a slower-moving fundamental value.">
<style>
  .price { stroke: #1d4e6b; }
  .fundamental { stroke: #a07a3c; }
  @media (prefers-color-scheme: dark) {
    .price { stroke: #74b6d6; }
    .fundamental { stroke: #d8ad69; }
  }
</style>
<path class="price" d="${path(hp)}" fill="none" stroke-width="1.6"/>
<path class="fundamental" d="${path(hf)}" fill="none" stroke-width="2" stroke-dasharray="5 3"/>
</svg>`;
  writeFileSync(join(ASSETS, 'hero-still.svg'), svg);
}

// The Open Graph card: the price-and-fundamental chart of the canonical run,
// written as a PNG by hand so the build needs no rasteriser.
{
  const W = 1200, H = 630;
  const bg = [252, 251, 248], ink = [26, 26, 24];
  const priceCol = [29, 78, 107], fundCol = [160, 122, 60];
  const buf = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) { buf[i * 3] = bg[0]; buf[i * 3 + 1] = bg[1]; buf[i * 3 + 2] = bg[2]; }
  const px = (x, y, c, a = 1) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 3;
    for (let k = 0; k < 3; k++) buf[o + k] = Math.round(buf[o + k] * (1 - a) + c[k] * a);
  };
  const line = (x0, y0, x1, y1, c, w) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= steps; s++) {
      const x = x0 + (x1 - x0) * s / steps, y = y0 + (y1 - y0) * s / steps;
      for (let d = -w; d <= w; d++) px(x, y + d, c, 1 - Math.abs(d) / (w + 1));
    }
  };
  const L = 90, R = W - 90, T = 170, B = H - 110;
  const all = price.concat(fundamental);
  const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo;
  const X = (i) => L + (i / (price.length - 1)) * (R - L);
  const Y = (v) => B - ((v - lo) / span) * (B - T);
  // Same order as the chart on the page: the noisy price first, then the
  // fundamental on top, so that both are visible in the card.
  for (let i = 1; i < price.length; i++) line(X(i - 1), Y(price[i - 1]), X(i), Y(price[i]), priceCol, 0);
  for (let i = 1; i < price.length; i++) line(X(i - 1), Y(fundamental[i - 1]), X(i), Y(fundamental[i]), fundCol, 1);
  line(L, B + 26, R, B + 26, ink, 0);
  line(L, T - 44, L + 150, T - 44, ink, 1);

  // PNG container
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    Buffer.from(buf.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
  }
  const crcTable = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
    return t;
  })();
  const crc = (b) => { let c = -1; for (const v of b) c = crcTable[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(join(ASSETS, 'og.png'), png);
}

console.log('wrote data/*.json and site/data/*.js');
console.log('wrote site/assets/hero-still.svg, site/assets/og.png');
console.log(`stats: daily sd ${round(retSd, 3)}%, kurtosis ${round(kurtosis, 2)}, ` +
  `acf|r|(1)=${acfAbs[0].toFixed(3)} (50)=${acfAbs[49].toFixed(3)} (200)=${acfAbs[199].toFixed(3)}`);
