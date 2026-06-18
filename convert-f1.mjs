// Compile Ergast/jolpi F1 results (2023-2025) into data/f1.js — one row per
// race entry — for a causal case study: "driver or car?" The constructor (car)
// confounds grid position and finishing result; teammates share a car (a natural
// control); grid's causal effect varies by circuit (Monaco vs Monza).
import { readFileSync, writeFileSync } from "fs";
const rows = [];
for (const s of ["2023","2024","2025"]) for (const o of [0,100,200,300,400]) {
  let j; try { j = JSON.parse(readFileSync(`data/_f1_${s}_${o}.json`,"utf8")); } catch { continue; }
  for (const race of j.MRData.RaceTable.Races) for (const r of race.Results) {
    const grid = +r.grid || 21;                 // 0 = pit-lane start -> back
    const finish = +r.position;                  // official classification
    const status = r.status || "";
    const dnf = !(status === "Finished" || /Lap/.test(status)) ? 1 : 0;
    rows.push({
      season: s, round: +race.round, race: race.raceName.replace(" Grand Prix",""),
      circuit: race.Circuit.circuitId,
      driver: r.Driver.code || (r.Driver.familyName||"").slice(0,3).toUpperCase(),
      constructor: r.Constructor.name,
      grid, finish: Number.isFinite(finish) ? finish : 21,
      points: +r.points || 0, dnf,
    });
  }
}
const meta = {
  name: "Formula 1 race results — “driver or car?”",
  source: "Ergast / jolpi.ca API, 2023–2025 seasons (3 × 24 races)",
  outcome: "finishing position", treatment: "grid (start) position",
  note: "Causal case study: the car (constructor) confounds grid & finish; teammates share a car (a natural control isolating driver skill); grid’s causal effect varies by circuit.",
};
writeFileSync("data/f1.js",
  `// AUTO-GENERATED from the Ergast/jolpi F1 API. Do not edit by hand.\n`+
  `export const meta = ${JSON.stringify(meta)};\n`+
  `export const rows = ${JSON.stringify(rows)};\n`);
console.log(`data/f1.js  rows=${rows.length}  bytes=${JSON.stringify(rows).length}`);
