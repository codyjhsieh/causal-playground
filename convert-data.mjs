// One-shot build step: parse the downloaded real public CSVs into compact,
// statically-importable ES modules under data/*.js (so modules load real data
// offline with no fetch, and the Node smoke test sees the same data). Big files
// are deterministically subsampled (still real rows) to keep sizes sane.
import { readFileSync, writeFileSync } from "fs";

function parseCSV(text, sep = ",") {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.length);
  const header = lines[0].split(sep);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(sep);
    const o = {};
    for (let j = 0; j < header.length; j++) {
      const raw = parts[j];
      if (raw === undefined || raw === "" || raw === "NA") { o[header[j]] = null; continue; }
      const num = Number(raw);
      o[header[j]] = Number.isNaN(num) ? raw : num;
    }
    rows.push(o);
  }
  return { header, rows };
}

// deterministic LCG subsample
function subsample(rows, cap, seed = 12345) {
  if (rows.length <= cap) return rows;
  let a = seed >>> 0;
  const idx = rows.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    a = (a * 1103515245 + 12345) & 0x7fffffff;
    const j = a % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, cap).sort((x, y) => x - y).map((i) => rows[i]);
}

function emit(name, rows, meta, cols) {
  // keep only requested columns if given, to shrink output
  const slim = cols ? rows.map((r) => { const o = {}; for (const c of cols) o[c] = r[c]; return o; }) : rows;
  const body =
    `// AUTO-GENERATED from real public data. Do not edit by hand.\n` +
    `export const meta = ${JSON.stringify(meta)};\n` +
    `export const rows = ${JSON.stringify(slim)};\n`;
  writeFileSync(`data/${name}.js`, body);
  console.log(`  data/${name}.js  n=${slim.length}  cols=${cols ? cols.length : Object.keys(slim[0]||{}).length}  bytes=${body.length}`);
}

// ---- NSW (LaLonde / Dehejia-Wahba) experimental + CPS controls ----
{
  const cols = ["treat", "age", "educ", "black", "hisp", "marr", "nodegree", "re74", "re75", "re78"];
  const nsw = parseCSV(readFileSync("data/nsw_mixtape.csv", "utf8")).rows;
  emit("nsw", nsw, { name: "NSW (National Supported Work)", source: "LaLonde 1986; Dehejia & Wahba 1999", outcome: "re78 (1978 earnings $)", treatment: "treat (job training)", note: "Randomized experimental sample" }, cols);
  const cps = subsample(parseCSV(readFileSync("data/cps_mixtape.csv", "utf8")).rows, 4000);
  emit("cps", cps, { name: "CPS comparison group", source: "Current Population Survey (Dehejia-Wahba)", note: "Non-experimental controls — random subsample of 15,992" }, cols);
}

// ---- Card (1995) schooling & wages, IV = proximity to college ----
{
  const cols = ["lwage", "educ", "nearc4", "exper", "expersq", "black", "south", "smsa", "age", "fatheduc", "motheduc"];
  const card = parseCSV(readFileSync("data/card.csv", "utf8")).rows.filter((r) => r.lwage != null && r.educ != null);
  emit("card", card, { name: "Card (1995) schooling & earnings", source: "Card 1995 (NLSYM)", outcome: "lwage (log hourly wage)", treatment: "educ (years schooling)", instrument: "nearc4 (grew up near 4-yr college)" }, cols);
}

// ---- close elections (Lee-style RDD: incumbency advantage) ----
{
  const cols = ["demvoteshare", "lagdemvoteshare", "democrat", "lagdemocrat", "score", "year"];
  let rows = parseCSV(readFileSync("data/close_elections_lmb.csv", "utf8")).rows
    .filter((r) => r.demvoteshare != null && r.lagdemvoteshare != null);
  rows = subsample(rows, 5000);
  emit("elections", rows, { name: "U.S. House close elections", source: "Lee 2008; Lee-Moretti-Butler", running: "lagdemvoteshare − 0.5 (won last race)", outcome: "demvoteshare (current Dem vote share)", cutoff: 0.5, note: "Incumbency advantage via RDD" }, cols);
}

// ---- Thornton (2008) HIV testing RCT ----
{
  const cols = ["any", "got", "tinc", "distvct", "age", "hiv2004"];
  const rows = parseCSV(readFileSync("data/thornton_hiv.csv", "utf8")).rows
    .filter((r) => r.any != null && r.got != null);
  emit("thornton", rows, { name: "Thornton (2008) HIV learning RCT", source: "Thornton, AER 2008 (Malawi)", outcome: "got (learned HIV status)", treatment: "any (any cash incentive, randomized)", note: "Randomized field experiment" }, cols);
}

// ---- 401(k) eligibility & wealth (canonical DML dataset) ----
{
  const cols = ["e401k", "p401k", "nettfa", "inc", "age", "fsize", "marr", "male", "pira"];
  const rows = parseCSV(readFileSync("data/k401ksubs.csv", "utf8")).rows.filter((r) => r.nettfa != null && r.inc != null);
  emit("pension401k", rows, { name: "401(k) eligibility & net assets", source: "Poterba-Venti-Wise; used in Chernozhukov et al. DML", outcome: "nettfa (net financial assets $000)", treatment: "e401k (401k eligibility)", note: "Eligibility ~ unconfounded given income/age" }, cols);
}

// ---- Sachs (2005) protein-signaling network (causal discovery ground truth) ----
{
  const txt = readFileSync("data/sachs.txt", "utf8");
  const { header, rows } = parseCSV(txt, "\t");
  emit("sachs", subsample(rows, 1500), {
    name: "Sachs et al. (2005) protein-signaling network",
    source: "Sachs, Perez, Pe'er, Lauffenburger, Nolan — Science 2005",
    vars: header,
    note: "Flow-cytometry of 11 phosphoproteins; consensus network is the discovery benchmark",
    // consensus directed edges (ground truth) used for SHD scoring
    trueEdges: [["PKC","Raf"],["PKC","Mek"],["PKC","Jnk"],["PKC","P38"],["PKC","PKA"],["PKA","Raf"],["PKA","Mek"],["PKA","Erk"],["PKA","Akt"],["PKA","Jnk"],["PKA","P38"],["Raf","Mek"],["Mek","Erk"],["Erk","Akt"],["Plcg","PIP2"],["Plcg","PIP3"],["PIP3","PIP2"],["PIP2","PKC"],["PIP3","Plcg"]],
  }, header);
}

// ---- IHDP (Hill 2011) — real covariates, simulated counterfactuals (CFR benchmark) ----
{
  // headerless: treatment, y_factual, y_cfactual, mu0, mu1, x1..x25
  const lines = readFileSync("data/ihdp_1.csv", "utf8").replace(/\r/g, "").split("\n").filter((l) => l.length);
  const rows = lines.map((l) => {
    const v = l.split(",").map(Number);
    const o = { t: v[0], yf: v[1], ycf: v[2], mu0: v[3], mu1: v[4] };
    for (let j = 0; j < 25; j++) o["x" + (j + 1)] = v[5 + j];
    return o;
  });
  emit("ihdp", rows, {
    name: "IHDP (Infant Health & Development Program)",
    source: "Hill 2011; covariates are REAL, potential outcomes simulated (NPCI setup)",
    outcome: "yf (factual), ycf (counterfactual)", treatment: "t",
    truth: "true ITE = mu1 − mu0 (known because outcomes are simulated)",
    note: "Semi-synthetic: real covariates, simulated outcomes so the counterfactual is known for PEHE",
  }, null);
}

// ---- California Prop 99 tobacco (synthetic control benchmark) ----
{
  const { rows } = parseCSV(readFileSync("data/prop99.csv", "utf8"), ";");
  const out = rows.map((r) => ({ state: r.State, year: r.Year, packs: r.PacksPerCapita, treated: r.treated }));
  emit("prop99", out, {
    name: "California Prop 99 — per-capita cigarette sales",
    source: "Abadie, Diamond & Hainmueller 2010 (CDC/Orzechowski-Walker)",
    outcome: "packs (per-capita cigarette packs/year)", treatment: "California Prop 99 tax (1988→)",
    treatedUnit: "California", treatYear: 1989,
    note: "State×year panel, 1970–2000; the canonical synthetic-control case",
  }, ["state", "year", "packs", "treated"]);
}

// ---- Castle Doctrine "stand your ground" laws (staggered DiD) ----
{
  const rows = parseCSV(readFileSync("data/castle.csv", "utf8")).rows;
  const eff = {};
  for (const r of rows) if (r.post === 1) eff[r.sid] = Math.min(eff[r.sid] ?? 9999, r.year);
  rows.forEach((r) => { r.effyear = eff[r.sid] != null ? eff[r.sid] : 0; }); // 0 = never adopts
  emit("castle", rows, {
    name: "Castle-Doctrine / Stand-Your-Ground laws & homicide",
    source: "Cheng & Hoekstra, J. Human Resources 2013",
    outcome: "l_homicide (log homicide rate)", treatment: "post (state has adopted the law)",
    note: "State×year 2000–2010; laws adopted in different years → staggered DiD",
  }, ["sid", "year", "homicide", "l_homicide", "post", "effyear", "popwt"]);
}

// ---- JOBS II job-search intervention (mediation) ----
{
  const cols = ["treat", "job_seek", "depress2", "depress1", "econ_hard", "sex", "age", "educ", "income"];
  const rows = parseCSV(readFileSync("data/jobs.csv", "utf8")).rows.filter((r) => r.treat != null && r.depress2 != null && r.job_seek != null);
  emit("jobs", rows, {
    name: "JOBS II job-search intervention",
    source: "Vinokur, Price & Schul 1995 (mediation package)",
    outcome: "depress2 (post depression)", treatment: "treat (job-search workshop)", mediator: "job_seek (job-search self-efficacy)",
    note: "Randomized; mediation: workshop → self-efficacy → depression",
  }, cols);
}

// ---- Cai et al. social-network insurance RCT (interference / spillovers) ----
{
  const cols = ["village", "takeup_survey", "intensive", "age", "male", "risk_averse", "literacy", "pre_takeup_rate"];
  const rows = parseCSV(readFileSync("data/insure.csv", "utf8")).rows.filter((r) => r.takeup_survey != null && r.intensive != null);
  emit("insure", rows, {
    name: "Social networks & weather-insurance take-up (China)",
    source: "Cai, de Janvry & Sadoulet, AEJ:Applied 2015",
    outcome: "takeup_survey (bought insurance)", treatment: "intensive (intensive info session)",
    note: "Two-stage village RCT; peer exposure creates spillovers (SUTVA violation)",
  }, cols);
}

console.log("done.");
