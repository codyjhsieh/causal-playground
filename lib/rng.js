// Deterministic, seedable randomness. Every simulation is reproducible so the
// same "experiment" can be replayed, and re-seeding is what makes "draw a new
// sample" meaningful rather than mysterious.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A small stateful RNG with the distributions simulations actually need.
export class RNG {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this._u = mulberry32(this.seed);
    this._spare = null;
  }
  reseed(seed) {
    this.seed = seed >>> 0;
    this._u = mulberry32(this.seed);
    this._spare = null;
    return this;
  }
  uniform(a = 0, b = 1) {
    return a + (b - a) * this._u();
  }
  // Box-Muller, caching the spare normal deviate.
  normal(mu = 0, sigma = 1) {
    if (this._spare !== null) {
      const z = this._spare;
      this._spare = null;
      return mu + sigma * z;
    }
    let u1 = 0, u2 = 0;
    while (u1 === 0) u1 = this._u();
    u2 = this._u();
    const r = Math.sqrt(-2 * Math.log(u1));
    const z0 = r * Math.cos(2 * Math.PI * u2);
    const z1 = r * Math.sin(2 * Math.PI * u2);
    this._spare = z1;
    return mu + sigma * z0;
  }
  bernoulli(p) {
    return this._u() < p ? 1 : 0;
  }
  // Inverse-CDF logistic, handy for treatment-assignment latent models.
  logistic(loc = 0, scale = 1) {
    const u = this._u();
    return loc + scale * Math.log(u / (1 - u));
  }
  choice(arr) {
    return arr[Math.floor(this._u() * arr.length)];
  }
  // Fisher-Yates, returns a new shuffled array.
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this._u() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

// Standard normal CDF (Abramowitz & Stegun 7.1.26) — used for p-values / curves.
export function normalCdf(x, mu = 0, sigma = 1) {
  const z = (x - mu) / (sigma * Math.SQRT2);
  // erf approximation
  const t = 1 / (1 + 0.3275911 * Math.abs(z));
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-z * z);
  const erf = z >= 0 ? y : -y;
  return 0.5 * (1 + erf);
}

// Standard normal density.
export function normalPdf(x, mu = 0, sigma = 1) {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}
