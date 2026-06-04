// Numerical verification of lib/nn.js: gradient-check the MLP, check matExp
// against a known value, and confirm Adam actually minimizes a real regression.
import { MLP, matExp, trace, mm, mT, mmdLinear } from "../lib/nn.js";

let fails = 0;
const approx = (a, b, tol, msg) => {
  const ok = Math.abs(a - b) <= tol;
  if (!ok) { fails++; console.log(`  FAIL ${msg}: ${a} vs ${b} (tol ${tol})`); }
  else console.log(`  ok   ${msg} (${a.toFixed(5)} ≈ ${b.toFixed(5)})`);
};

// ---- 1. matExp: exp of diag([0, ln2]) = diag([1, 2]) ----
{
  const E = matExp([[0, 0], [0, Math.log(2)]]);
  approx(E[0][0], 1, 1e-4, "matExp diag[0]");
  approx(E[1][1], 2, 1e-4, "matExp diag[1]");
  approx(E[0][1], 0, 1e-4, "matExp offdiag");
}
// exp of nilpotent [[0,1],[0,0]] = [[1,1],[0,1]]
{
  const E = matExp([[0, 1], [0, 0]]);
  approx(E[0][0], 1, 1e-5, "matExp nilpotent 00");
  approx(E[0][1], 1, 1e-5, "matExp nilpotent 01");
  approx(E[1][1], 1, 1e-5, "matExp nilpotent 11");
}

// ---- 2. gradient check the MLP via finite differences ----
{
  const net = new MLP([3, 5, 2], { activation: "tanh", seed: 7 });
  // small fixed batch
  const X = [[0.5, -0.2, 1.0], [-0.3, 0.8, 0.1], [0.2, 0.4, -0.7]];
  const Y = [[1.0, -0.5], [0.2, 0.3], [-0.4, 0.9]];
  const lossOf = () => {
    const out = net.forward(X);
    let L = 0;
    for (let i = 0; i < out.length; i++) for (let j = 0; j < out[0].length; j++) L += (out[i][j] - Y[i][j]) ** 2;
    return L / (out.length * out[0].length);
  };
  // analytic grads
  const out = net.forward(X);
  const n = out.length, m = out[0].length;
  const dOut = out.map((row, i) => row.map((v, j) => 2 * (v - Y[i][j]) / m));
  net.backward(dOut);
  // pick a weight in the first layer and finite-difference it
  const L0 = net.layers[0];
  const eps = 1e-5;
  let maxRelErr = 0;
  for (const [i, j] of [[0, 0], [1, 2], [2, 4]]) {
    const analytic = L0.gW[i][j];
    const orig = L0.W[i][j];
    L0.W[i][j] = orig + eps; const lp = lossOf();
    L0.W[i][j] = orig - eps; const lm = lossOf();
    L0.W[i][j] = orig;
    const numeric = (lp - lm) / (2 * eps);
    const rel = Math.abs(analytic - numeric) / (Math.abs(numeric) + 1e-8);
    maxRelErr = Math.max(maxRelErr, rel);
  }
  approx(maxRelErr, 0, 1e-3, "MLP gradient check (max rel err)");
}

// ---- 3. Adam minimizes a real nonlinear regression ----
{
  const net = new MLP([1, 16, 16, 1], { activation: "tanh", seed: 3 });
  // target: y = sin(2x)
  const X = [], Y = [];
  for (let i = 0; i < 64; i++) { const x = (i / 63) * 2 - 1; X.push([x]); Y.push([Math.sin(2 * x)]); }
  let first = 0, last = 0;
  for (let ep = 0; ep < 1500; ep++) { const l = net.trainStepMSE(X, Y, 5e-3); if (ep === 0) first = l; last = l; }
  console.log(`  info MLP regression loss ${first.toFixed(4)} -> ${last.toFixed(4)}`);
  if (last > 0.02 || last >= first) { fails++; console.log("  FAIL MLP did not learn sin(2x)"); }
  else console.log("  ok   MLP learned sin(2x)");
}

// ---- 4. mmdLinear is 0 for identical sets, >0 for shifted ----
{
  const A = [[0, 0], [1, 1], [2, 2]];
  approx(mmdLinear(A, A), 0, 1e-9, "MMD identical = 0");
  const B = A.map((r) => [r[0] + 3, r[1]]);
  const d = mmdLinear(A, B);
  if (d <= 0.1) { fails++; console.log("  FAIL MMD shifted not > 0"); } else console.log(`  ok   MMD shifted = ${d.toFixed(3)}`);
}

console.log(fails ? `\n${fails} check(s) FAILED` : "\nAll nn.js checks passed");
process.exit(fails ? 1 : 0);
