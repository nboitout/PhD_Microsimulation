// model.mjs — 2026 re-implementation of the Boitout & Delahaut (2003) agent-based
// foreign-exchange microsimulation, Chapter 2 of N. Boitout's doctoral dissertation.
//
// This single module is the whole model. It is used in two places:
//   * engine/generate.mjs  — run at build time under Node to produce data/*.json,
//                            the source of every published figure on the site;
//   * site/sim.worker.js   — imported by the browser worker for the hero animation
//                            and the playground, at a much smaller population.
//
// Sharing one module means the in-browser toy and the published figures cannot
// drift apart: they are the same equations, differing only in N and run length.
//
// Every equation below is transcribed from the source chapter. Where the source
// is ambiguous or silent, the choice is marked with a NOTE and is also recorded
// in README.md; nothing is silently invented.

// ---------------------------------------------------------------------------
// Random numbers
// ---------------------------------------------------------------------------

// xoshiro128** — small, fast, well-distributed, and seedable so that every
// published figure is reproducible from its seed.
export function makeRng(seed) {
  let s0 = seed >>> 0 || 1, s1 = 0x9e3779b9, s2 = 0x243f6a88, s3 = 0xb7e15162;
  // stir
  for (let i = 0; i < 16; i++) {
    const t = s1 << 9;
    s2 ^= s0; s3 ^= s1; s1 ^= s2; s0 ^= s3; s2 ^= t;
    s3 = (s3 << 11) | (s3 >>> 21);
  }
  return function next() {
    const r = Math.imul((s1 * 5) >>> 0, 7);
    const result = (((r << 7) | (r >>> 25)) >>> 0) * 9;
    const t = s1 << 9;
    s2 ^= s0; s3 ^= s1; s1 ^= s2; s0 ^= s3; s2 ^= t;
    s3 = (s3 << 11) | (s3 >>> 21);
    return (result >>> 0) / 4294967296;
  };
}

// Exponential waiting time by the transformation method, as in the original
// (Press et al. [1993]): if U is uniform on (0,1] then -ln(U)/rate ~ E(rate).
export function expo(rng, rate) {
  if (!(rate > 0)) return Infinity;
  let u = rng();
  if (u <= 0) u = Number.MIN_VALUE;
  return -Math.log(u) / rate;
}

// ---------------------------------------------------------------------------
// Calibrated parameters — Table 2.1 of the chapter
// ---------------------------------------------------------------------------

export const TABLE_2_1 = {
  N: 400,      // population of agents
  Pf: 100,     // initial fundamental value
  tc: 0.1,     // chartist unit order size
  tf: 3.0,     // fundamentalist reaction strength (the gamma of the ED equation)
  beta: 4,     // market maker's impatience
  nu1: 3.0,    // chartist-to-chartist meeting rate
  nu2: 0.5,    // chartist-to-fundamentalist meeting rate
  nu3: 0.005,  // news arrival rate, each direction
  a1: 0.7,     // weight on the opinion index (herding)
  a2: 1.0,     // weight on the momentum signal
  a3: 0.5,     // weight on the chartist/fundamentalist gain differential
  s: 0.75,     // discount on the fundamentalists' expected mispricing gain
  R: 0.0004,   // domestic risk-free rate
};

// Values the model needs that Table 2.1 does not publish. Each is chosen here
// for illustration only and is stated as such wherever it affects a figure.
export const UNPUBLISHED = {
  tau: 3,        // chartists' look-back horizon, in calendar days. Not in
                 // Table 2.1. Chosen by the screening step described in the
                 // chapter's own calibration passage: the value is the shortest
                 // of those tried that gives non-pathological dynamics across
                 // every seed tested. See README.md.
  r: 0.0004,     // foreign risk-free rate. Not in Table 2.1; set equal to R,
                 // i.e. a zero nominal interest differential. In the source r
                 // enters divided by p, so its magnitude is immaterial here.
  floor: 0.10,   // minimum share of the population in each of the three
                 // strategies. The chapter states that a minimum was imposed to
                 // prevent the absorbing states in which everyone holds one
                 // strategy, but does not publish its value.
  tick: 0.1,     // the basic increment, given in the text (section 2.2.4).
};

export function defaultParams(overrides = {}) {
  return { ...TABLE_2_1, ...UNPUBLISHED, ...overrides };
}

// ---------------------------------------------------------------------------
// Price history, for the lagged term p(t - tau)
// ---------------------------------------------------------------------------
//
// The force terms need the price as it stood tau days ago. Events arrive in
// time order, so a ring buffer with a trailing read pointer answers the query
// in amortised constant time.

class Trail {
  constructor(capacity) {
    this.t = new Float64Array(capacity);
    this.p = new Float64Array(capacity);
    this.cap = capacity;
    this.w = 0;     // total pushes; absolute index of the next write
    this.read = 0;  // absolute index of the trailing read cursor
  }
  push(t, p) {
    const i = this.w % this.cap;
    this.t[i] = t;
    this.p[i] = p;
    this.w++;
    // Keep the cursor inside the window that is still live.
    const oldest = Math.max(0, this.w - this.cap);
    if (this.read < oldest) this.read = oldest;
  }
  // Price at or just before time `target`. Amortised constant time: the cursor
  // only ever moves forward, and events arrive in time order.
  at(target) {
    const oldest = Math.max(0, this.w - this.cap);
    if (this.read < oldest) this.read = oldest;
    while (this.read + 1 < this.w && this.t[(this.read + 1) % this.cap] <= target) {
      this.read++;
    }
    return this.p[this.read % this.cap];
  }
}

// ---------------------------------------------------------------------------
// The market
// ---------------------------------------------------------------------------

export class Market {
  constructor(params = {}, seed = 1) {
    const P = defaultParams(params);
    this.P = P;
    this.rng = makeRng(seed);

    const n = P.N;
    this.n = n;
    // Start from an even three-way split, with the market at its fundamental.
    this.nPlus = Math.round(n / 3);
    this.nMinus = Math.round(n / 3);
    this.p = P.Pf;
    this.pf = P.Pf;
    this.t = 0;

    this.minCount = Math.max(1, Math.floor(P.floor * n));

    // A window of price history a little longer than tau.
    this.trail = new Trail(1 << 16);
    this.trail.push(0, this.p);

    this.beta = new Float64Array(10);
    this.dt = new Float64Array(10);

    // Counters, reset by the caller once per recorded day.
    this.ticks = 0;      // number of price revisions in the period
    this.volume = 0;     // gross size transacted against the market maker
    this.events = 0;     // realised events of any kind
    this.lastEvent = -1; // index 0..9 of the event that won the last race
    this.lastDt = 0;
  }

  get nChart() { return this.nPlus + this.nMinus; }
  get nFund() { return this.n - this.nPlus - this.nMinus; }

  // Excess demand: chartists' net position plus the fundamentalists' response
  // to mispricing.  ED = (n+ - n-) t_c + n_f * gamma * (p_f - p) / p
  excessDemand() {
    const P = this.P;
    return (this.nPlus - this.nMinus) * P.tc
      + this.nFund * P.tf * (this.pf - this.p) / this.p;
  }

  // The ten jump rates of section 2.2.2.
  rates(out) {
    const P = this.P, n = this.n;
    const nPlus = this.nPlus, nMinus = this.nMinus;
    const nc = nPlus + nMinus, nf = n - nc;

    const pLag = this.trail.at(this.t - P.tau);
    const slope = (this.p - pLag) / P.tau;          // price change per day

    const x = nc > 0 ? (nPlus - nMinus) / nc : 0;   // opinion index, in [-1, 1]

    // NOTE. The source writes U1 = a1*x + (a2/nu1) * [p(t) - p(t-tau)] / tau,
    // with the momentum term in absolute price units. At the Table 2.1 values
    // and a fundamental of 100 that term reaches magnitudes of 20 and more, the
    // exponential rates overflow, one chartist camp empties to its floor and the
    // internal clock stops advancing. The term is therefore read here as a rate
    // of return rather than a price change — divided by p, exactly as the same
    // momentum signal is written inside U2,1 and U2,2 in the source, and as the
    // scale-free opinion index it is added to requires. This is the only place
    // where the implementation departs from the transcribed text; it is recorded
    // in README.md and stated on the site.
    const U1 = P.a1 * x + (P.a2 / P.nu1) * (slope / this.p);

    const carry = (P.r + (1 / P.nu2) * slope) / this.p;
    const gap = P.s * Math.abs((this.pf - this.p) / this.p);
    const U21 = P.a3 * (carry - P.R - gap);   // optimist  <-> fundamentalist
    const U22 = P.a3 * (P.R - carry - gap);   // pessimist <-> fundamentalist

    const fPlus = nPlus / n, fMinus = nMinus / n, fc = nc / n, ff = nf / n;

    out[0] = P.nu1 * fMinus * fc * Math.exp(U1);    // b1  pessimist  -> optimist
    out[1] = P.nu1 * fPlus * fc * Math.exp(-U1);    // b2  optimist   -> pessimist
    out[2] = P.nu2 * ff * fPlus * Math.exp(U21);    // b3  fundament. -> optimist
    out[3] = P.nu2 * ff * fPlus * Math.exp(-U21);   // b4  optimist   -> fundament.
    out[4] = P.nu2 * ff * fMinus * Math.exp(U22);   // b5  fundament. -> pessimist
    out[5] = P.nu2 * fMinus * ff * Math.exp(-U22);  // b6  pessimist  -> fundament.

    // NOTE. The source gives the market maker's rates twice: as b7 = beta*ED and
    // b8 = -beta*ED in the list of jump rates, and as P(.|ED) = exp(beta*ED) in
    // section 2.2.4. The second form is not a probability (it exceeds one for
    // positive ED) and diverges for the excess demands this population produces,
    // so the linear rate from the list of jump rates is used, with the sign
    // convention that only the rate in the direction of the imbalance is live.
    const ed = this.excessDemand();
    out[6] = ed > 0 ? P.beta * ed : 0;              // b7  price up
    out[7] = ed < 0 ? -P.beta * ed : 0;             // b8  price down

    out[8] = P.nu3;                                 // b9  fundamental up
    out[9] = P.nu3;                                 // b10 fundamental down

    return out;
  }

  // Population floors: the chapter imposes a minimum on each strategy share to
  // rule out the absorbing states. A switch that would break a floor is void.
  canLeave(which) {
    if (which === 'plus') return this.nPlus > this.minCount;
    if (which === 'minus') return this.nMinus > this.minCount;
    return this.nFund > this.minCount;
  }

  // One event. Ten clocks are drawn; only the shortest runs out.
  step() {
    const P = this.P, n = this.n;
    const b = this.rates(this.beta);
    const dt = this.dt;

    let win = -1, best = Infinity;
    for (let i = 0; i < 10; i++) {
      // dt_j ~ E(n * beta_j): n scales the whole system's clock.
      const d = expo(this.rng, n * b[i]);
      dt[i] = d;
      if (d < best) { best = d; win = i; }
    }
    if (win < 0) { this.t += 1e-6; return -1; }

    this.t += best;
    this.lastDt = best;
    this.lastEvent = win;
    this.events++;

    switch (win) {
      case 0: if (this.canLeave('minus')) { this.nMinus--; this.nPlus++; } break;
      case 1: if (this.canLeave('plus')) { this.nPlus--; this.nMinus++; } break;
      case 2: if (this.canLeave('fund')) { this.nPlus++; } break;
      case 3: if (this.canLeave('plus')) { this.nPlus--; } break;
      case 4: if (this.canLeave('fund')) { this.nMinus++; } break;
      case 5: if (this.canLeave('minus')) { this.nMinus--; } break;
      case 6:
      case 7:
        this.p += (win === 6 ? P.tick : -P.tick);
        this.ticks++;
        // Trading volume. The chapter defines order flow as signed trading
        // volume and as the record of transactions actually executed, as
        // against a mere change in demand. Volume is therefore accumulated at
        // the moment of a transaction, and is the gross size reaching the
        // market maker then: every chartist's unit order plus every
        // fundamentalist's order, which scales with the mispricing.
        this.volume += this.nChart * P.tc
          + this.nFund * P.tf * Math.abs((this.pf - this.p) / this.p);
        this.trail.push(this.t, this.p);
        break;
      case 8: this.pf += P.tick; break;
      case 9: this.pf -= P.tick; break;
    }
    // Guard against a price walking into non-positive territory; the ratios in
    // the force terms are undefined there. In practice the fundamentalist arm of
    // excess demand keeps the price well away from zero.
    if (this.p < P.tick) this.p = P.tick;
    if (this.pf < P.tick) this.pf = P.tick;
    return win;
  }

  // Advance until the internal clock passes `untilDay`, then report the close.
  // This is the recording rule of section 2.2.3:
  //     if (t_i > day + 1) record the market price and set day = day + 1.
  runToDay(untilDay, maxEvents = 5e6) {
    let guard = 0;
    while (this.t < untilDay && guard < maxEvents) { this.step(); guard++; }
    return guard;
  }
}

export const EVENT_LABELS = [
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

export const EVENT_SYMBOLS = [
  'β₁', 'β₂', 'β₃', 'β₄', 'β₅',
  'β₆', 'β₇', 'β₈', 'β₉', 'β₁₀',
];
