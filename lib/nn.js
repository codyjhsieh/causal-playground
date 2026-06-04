// A tiny, dependency-free neural-net + matrix toolkit, just enough to TRAIN real
// (small) models live in the browser: an MLP with manual backprop and Adam, plus
// the matrix ops causal-ML modules need (matmul, transpose, hadamard, trace, and
// a matrix exponential for the NOTEARS acyclicity constraint). All plain arrays
// of arrays. Verified by gradient-checking in test/nn.test.mjs.

import { RNG } from "./rng.js";

// ---- matrix utilities (row-major arrays of arrays) ----
export const zeros = (r, c) => Array.from({ length: r }, () => new Array(c).fill(0));
export function eye(n) { const M = zeros(n, n); for (let i = 0; i < n; i++) M[i][i] = 1; return M; }
export function mT(A) {
  const r = A.length, c = A[0].length, B = zeros(c, r);
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) B[j][i] = A[i][j];
  return B;
}
export function mm(A, B) {
  const r = A.length, k = B.length, c = B[0].length;
  const C = zeros(r, c);
  for (let i = 0; i < r; i++) {
    const Ai = A[i], Ci = C[i];
    for (let t = 0; t < k; t++) {
      const a = Ai[t], Bt = B[t];
      if (a === 0) continue;
      for (let j = 0; j < c; j++) Ci[j] += a * Bt[j];
    }
  }
  return C;
}
export const madd = (A, B) => A.map((row, i) => row.map((v, j) => v + B[i][j]));
export const msub = (A, B) => A.map((row, i) => row.map((v, j) => v - B[i][j]));
export const mscale = (A, s) => A.map((row) => row.map((v) => v * s));
export const hadamard = (A, B) => A.map((row, i) => row.map((v, j) => v * B[i][j]));
export function trace(A) { let t = 0; for (let i = 0; i < A.length; i++) t += A[i][i]; return t; }
export function frob2(A) { let s = 0; for (const row of A) for (const v of row) s += v * v; return s; }
export const clone = (A) => A.map((row) => row.slice());

// Matrix exponential via scaling-and-squaring + Taylor series. Accurate enough
// for the small (≤ ~10×10) matrices used by the acyclicity constraint.
export function matExp(A, terms = 18) {
  const n = A.length;
  // scale so that the norm is small, then square back
  let norm = 0;
  for (const row of A) for (const v of row) norm = Math.max(norm, Math.abs(v));
  let s = 0;
  while (norm > 0.5) { norm /= 2; s++; }
  const B = mscale(A, 1 / Math.pow(2, s));
  // Taylor: I + B + B^2/2! + ...
  let term = eye(n);
  let result = eye(n);
  for (let k = 1; k <= terms; k++) {
    term = mscale(mm(term, B), 1 / k);
    result = madd(result, term);
  }
  // square s times
  for (let i = 0; i < s; i++) result = mm(result, result);
  return result;
}

// ---- activations ----
const ACT = {
  relu: { f: (x) => (x > 0 ? x : 0), df: (x) => (x > 0 ? 1 : 0) },
  tanh: { f: Math.tanh, df: (x) => 1 - Math.tanh(x) ** 2 },
  identity: { f: (x) => x, df: () => 1 },
  elu: { f: (x) => (x > 0 ? x : Math.exp(x) - 1), df: (x) => (x > 0 ? 1 : Math.exp(x)) },
};

// ---- a dense layer with its own Adam state ----
class Dense {
  constructor(nin, nout, act, rng) {
    const scale = Math.sqrt(2 / nin); // He init
    this.W = Array.from({ length: nin }, () => Array.from({ length: nout }, () => rng.normal(0, scale)));
    this.b = new Array(nout).fill(0);
    this.act = ACT[act] || ACT.identity;
    // Adam moments
    this.mW = zeros(nin, nout); this.vW = zeros(nin, nout);
    this.mb = new Array(nout).fill(0); this.vb = new Array(nout).fill(0);
    this.gW = zeros(nin, nout); this.gb = new Array(nout).fill(0);
  }
  forward(X) {
    // X: n×nin  ->  Z = X·W + b ; A = act(Z)
    this.X = X;
    const n = X.length, nout = this.b.length;
    const Z = mm(X, this.W);
    for (let i = 0; i < n; i++) for (let j = 0; j < nout; j++) Z[i][j] += this.b[j];
    this.Z = Z;
    const A = Z.map((row) => row.map(this.act.f));
    return A;
  }
  // dA: n×nout gradient of loss wrt this layer's activation. Returns dX (n×nin).
  backward(dA) {
    const n = this.X.length, nin = this.W.length, nout = this.b.length;
    // dZ = dA ⊙ act'(Z)
    const dZ = zeros(n, nout);
    for (let i = 0; i < n; i++) for (let j = 0; j < nout; j++) dZ[i][j] = dA[i][j] * this.act.df(this.Z[i][j]);
    // grads (averaged over batch)
    const Xt = mT(this.X);
    const gW = mm(Xt, dZ);
    for (let i = 0; i < nin; i++) for (let j = 0; j < nout; j++) this.gW[i][j] = gW[i][j] / n;
    for (let j = 0; j < nout; j++) { let s = 0; for (let i = 0; i < n; i++) s += dZ[i][j]; this.gb[j] = s / n; }
    // dX = dZ · Wᵀ
    return mm(dZ, mT(this.W));
  }
  adamStep(lr, t, b1 = 0.9, b2 = 0.999, eps = 1e-8, wd = 0) {
    const nin = this.W.length, nout = this.b.length;
    const bc1 = 1 - Math.pow(b1, t), bc2 = 1 - Math.pow(b2, t);
    for (let i = 0; i < nin; i++) for (let j = 0; j < nout; j++) {
      let g = this.gW[i][j] + wd * this.W[i][j];
      this.mW[i][j] = b1 * this.mW[i][j] + (1 - b1) * g;
      this.vW[i][j] = b2 * this.vW[i][j] + (1 - b2) * g * g;
      const mh = this.mW[i][j] / bc1, vh = this.vW[i][j] / bc2;
      this.W[i][j] -= lr * mh / (Math.sqrt(vh) + eps);
    }
    for (let j = 0; j < nout; j++) {
      const g = this.gb[j];
      this.mb[j] = b1 * this.mb[j] + (1 - b1) * g;
      this.vb[j] = b2 * this.vb[j] + (1 - b2) * g * g;
      const mh = this.mb[j] / bc1, vh = this.vb[j] / bc2;
      this.b[j] -= lr * mh / (Math.sqrt(vh) + eps);
    }
  }
}

// A small multilayer perceptron. sizes = [nin, h1, h2, ..., nout].
// activations applied to hidden layers; output layer is linear by default.
export class MLP {
  constructor(sizes, { activation = "relu", outAct = "identity", seed = 1 } = {}) {
    const rng = new RNG(seed);
    this.layers = [];
    for (let i = 0; i < sizes.length - 1; i++) {
      const isOut = i === sizes.length - 2;
      this.layers.push(new Dense(sizes[i], sizes[i + 1], isOut ? outAct : activation, rng));
    }
    this.t = 0;
  }
  forward(X) {
    let A = X;
    this.acts = [X];
    for (const L of this.layers) { A = L.forward(A); this.acts.push(A); }
    return A;
  }
  // dOut: gradient of loss wrt network output (n×nout). Backprops, fills grads.
  backward(dOut) {
    let d = dOut;
    for (let i = this.layers.length - 1; i >= 0; i--) d = this.layers[i].backward(d);
    return d; // gradient wrt input (useful for representation methods)
  }
  step(lr = 1e-2, wd = 0) { this.t++; for (const L of this.layers) L.adamStep(lr, this.t, undefined, undefined, undefined, wd); }
  // Convenience: one MSE training step on (X, Y). Returns mean loss.
  trainStepMSE(X, Y, lr = 1e-2, wd = 0) {
    const out = this.forward(X);
    const n = out.length, m = out[0].length;
    const dOut = zeros(n, m);
    let loss = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      const e = out[i][j] - Y[i][j];
      loss += e * e;
      dOut[i][j] = 2 * e / m; // dMSE/dout (the /n batch-avg happens in backward)
    }
    this.backward(dOut);
    this.step(lr, wd);
    return loss / (n * m);
  }
  predict(X) { return this.forward(X); }
}

// ---- helpers commonly needed by modules ----
export const sigmoid = (x) => 1 / (1 + Math.exp(-x));
export function softplus(x) { return x > 20 ? x : Math.log1p(Math.exp(x)); }

// Maximum Mean Discrepancy (linear-kernel / mean-difference form) between two
// sets of representation rows — the balancing penalty used by CFR/TARNet.
export function mmdLinear(A, B) {
  if (!A.length || !B.length) return 0;
  const d = A[0].length;
  const ma = new Array(d).fill(0), mb = new Array(d).fill(0);
  for (const r of A) for (let j = 0; j < d; j++) ma[j] += r[j] / A.length;
  for (const r of B) for (let j = 0; j < d; j++) mb[j] += r[j] / B.length;
  let s = 0; for (let j = 0; j < d; j++) s += (ma[j] - mb[j]) ** 2;
  return Math.sqrt(s);
}
