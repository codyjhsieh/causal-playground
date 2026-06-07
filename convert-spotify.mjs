// Compile the TidyTuesday Spotify songs dataset into data/spotify.js.
// 30,677 complete tracks → deterministic subsample of 6,000 with audio features,
// popularity, and genre — for a causal-discovery case study ("what makes a hit?").
import { readFileSync, writeFileSync } from "fs";
const L = readFileSync("data/_spotify.csv","utf8").replace(/\r/g,"").split("\n").filter(x=>x);
const H = L[0].split(","), ix = Object.fromEntries(H.map((h,i)=>[h,i]));
const MAP = { danceability:"dance", energy:"energy", loudness:"loud", speechiness:"speech",
  acousticness:"acoustic", instrumentalness:"instrument", liveness:"live", valence:"valence", tempo:"tempo" };
const src = Object.keys(MAP);
let rows = [];
for (let i=1;i<L.length;i++){
  const p = L[i].split(","); const o = {};
  o.pop = +p[ix.track_popularity]; o.dur = +p[ix.duration_ms]/60000; o.genre = p[ix.playlist_genre];
  let ok = Number.isFinite(o.pop) && Number.isFinite(o.dur) && o.genre;
  for (const s of src){ o[MAP[s]] = +p[ix[s]]; if(!Number.isFinite(o[MAP[s]])) ok=false; }
  if (ok) rows.push(o);
}
// deterministic subsample to 6000
let a = 20250607>>>0; const idx = rows.map((_,i)=>i);
for (let i=idx.length-1;i>0;i--){ a=(a*1103515245+12345)&0x7fffffff; const j=a%(i+1); [idx[i],idx[j]]=[idx[j],idx[i]]; }
const sub = idx.slice(0,6000).sort((x,y)=>x-y).map(i=>rows[i]);
// round to 4 dp to shrink
for (const r of sub){ for (const k of ["dance","energy","loud","speech","acoustic","instrument","live","valence","tempo","dur"]) r[k]=Math.round(r[k]*1e4)/1e4; }
const meta = {
  name: "Spotify audio features — “what makes a song popular?”",
  source: "Spotify Web API via TidyTuesday (rfordatascience), 2020",
  outcome: "track_popularity (0–100)", treatment: "audio features (danceability, energy, …)",
  note: "Causal-discovery case study: features form a clean network, but popularity has no strong measured cause — the real driver (fame, marketing, playlists) isn’t in the data.",
};
writeFileSync("data/spotify.js",
  `// AUTO-GENERATED from the TidyTuesday Spotify dataset. Do not edit by hand.\n`+
  `export const meta = ${JSON.stringify(meta)};\n`+
  `export const rows = ${JSON.stringify(sub)};\n`);
console.log(`data/spotify.js  n=${sub.length}  bytes=${JSON.stringify(sub).length}`);
