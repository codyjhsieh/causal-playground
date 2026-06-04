// Estimators. These are the actual machinery of causal inference — OLS,
// covariance, matching distances — implemented directly so the diagrams compute
// real numbers from real samples rather than displaying canned results.

export const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function variance(xs, sample = true) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const ss = xs.reduce((a, b) => a + (b - m) * (b - m), 0);
  return ss / (xs.length - (sample ? 1 : 0));
}

export const std = (xs, sample = true) => Math.sqrt(variance(xs, sample));

export function covariance(xs, ys, sample = true) {
  const mx = mean(xs), my = mean(ys);
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += (xs[i] - mx) * (ys[i] - my);
  return s / (xs.length - (sample ? 1 : 0));
}

export function correlation(xs, ys) {
  const c = covariance(xs, ys);
  const sx = std(xs), sy = std(ys);
  if (sx === 0 || sy === 0) return 0;
  return c / (sx * sy);
}

export function quantile(sortedOrNot, q, presorted = false) {
  const xs = presorted ? sortedOrNot : sortedOrNot.slice().sort((a, b) => a - b);
  if (xs.length === 0) return NaN;
  const pos = (xs.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return xs[lo];
  return xs[lo] + (pos - lo) * (xs[hi] - xs[lo]);
}

// Simple linear regression y ~ a + b x. Returns slope, intercept, r^2, se(b).
export function ols1(xs, ys) {
  const n = xs.length;
  const mx = mean(xs), my = mean(ys);
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
    syy += (ys[i] - my) ** 2;
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  const a = my - b * mx;
  const r2 = sxx === 0 || syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  // residual variance -> se of slope
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const e = ys[i] - (a + b * xs[i]);
    sse += e * e;
  }
  const sigma2 = n > 2 ? sse / (n - 2) : 0;
  const seB = sxx > 0 ? Math.sqrt(sigma2 / sxx) : 0;
  return { a, b, slope: b, intercept: a, r2, seB, n };
}

// Multiple regression via normal equations: y ~ X beta, X already includes the
// intercept column. Small p only (we solve p×p by Gauss-Jordan). Returns beta[]
// and standard errors. This is what "controlling for" literally does.
export function olsMulti(X, y) {
  const n = X.length;
  const p = X[0].length;
  // XtX (p×p), Xty (p)
  const XtX = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty = new Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    const row = X[i];
    for (let j = 0; j < p; j++) {
      Xty[j] += row[j] * y[i];
      for (let k = 0; k < p; k++) XtX[j][k] += row[j] * row[k];
    }
  }
  const inv = invert(XtX);
  if (!inv) return { beta: new Array(p).fill(0), se: new Array(p).fill(0), fail: true };
  const beta = matVec(inv, Xty);
  // residual variance
  let sse = 0;
  for (let i = 0; i < n; i++) {
    let yhat = 0;
    for (let j = 0; j < p; j++) yhat += X[i][j] * beta[j];
    sse += (y[i] - yhat) ** 2;
  }
  const dof = Math.max(1, n - p);
  const sigma2 = sse / dof;
  const se = inv.map((row, j) => Math.sqrt(Math.max(0, sigma2 * inv[j][j])));
  return { beta, se, sigma2, n, p };
}

function matVec(A, v) {
  return A.map((row) => row.reduce((s, a, j) => s + a * v[j], 0));
}

// Gauss-Jordan inverse for small symmetric matrices. Returns null if singular.
export function invert(M) {
  const n = M.length;
  const A = M.map((row, i) => [...row, ...identityRow(n, i)]);
  for (let col = 0; col < n; col++) {
    // pivot
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-12) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    const d = A[col][col];
    for (let j = 0; j < 2 * n; j++) A[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col];
      for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[col][j];
    }
  }
  return A.map((row) => row.slice(n));
}
function identityRow(n, i) {
  const r = new Array(n).fill(0);
  r[i] = 1;
  return r;
}

// Logistic regression by Newton-Raphson / IRLS — the propensity-score engine.
export function logisticFit(X, y, iters = 25) {
  const n = X.length, p = X[0].length;
  let beta = new Array(p).fill(0);
  for (let it = 0; it < iters; it++) {
    const grad = new Array(p).fill(0);
    const H = Array.from({ length: p }, () => new Array(p).fill(0));
    for (let i = 0; i < n; i++) {
      let eta = 0;
      for (let j = 0; j < p; j++) eta += X[i][j] * beta[j];
      const mu = 1 / (1 + Math.exp(-eta));
      const w = Math.max(mu * (1 - mu), 1e-6);
      const r = y[i] - mu;
      for (let j = 0; j < p; j++) {
        grad[j] += X[i][j] * r;
        for (let k = 0; k < p; k++) H[j][k] += X[i][j] * X[i][k] * w;
      }
    }
    const inv = invert(H);
    if (!inv) break;
    const step = matVec(inv, grad);
    let maxStep = 0;
    for (let j = 0; j < p; j++) {
      beta[j] += step[j];
      maxStep = Math.max(maxStep, Math.abs(step[j]));
    }
    if (maxStep < 1e-8) break;
  }
  const predict = (row) => {
    let eta = 0;
    for (let j = 0; j < row.length; j++) eta += row[j] * beta[j];
    return 1 / (1 + Math.exp(-eta));
  };
  return { beta, predict };
}

export function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}
