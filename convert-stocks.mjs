// Compile 20 Yahoo Finance daily-price JSONs (2024-06→2026-06) into data/stocks.js:
// aligned daily log returns (%) + ticker metadata, for a causal-discovery case study
// ("what causes a stock to move?" — the market factor confounds everything).
import { readFileSync, writeFileSync } from "fs";
const TK = [
  ["SPY","S&P 500","Market"],
  ["AAPL","Apple","Technology"],["MSFT","Microsoft","Technology"],["NVDA","Nvidia","Technology"],
  ["GOOGL","Alphabet","Technology"],["META","Meta","Technology"],
  ["JPM","JPMorgan","Financials"],["BAC","Bank of America","Financials"],["GS","Goldman Sachs","Financials"],
  ["XOM","Exxon","Energy"],["CVX","Chevron","Energy"],["COP","ConocoPhillips","Energy"],
  ["WMT","Walmart","Staples"],["KO","Coca-Cola","Staples"],["PG","P&G","Staples"],
  ["JNJ","J&J","Health"],["UNH","UnitedHealth","Health"],["PFE","Pfizer","Health"],
  ["TSLA","Tesla","Consumer"],["CAT","Caterpillar","Industrials"],
];
// per ticker: map date(YYYY-MM-DD) -> close
const series = {};
for (const [sym] of TK) {
  const j = JSON.parse(readFileSync(`data/_y_${sym}.json`,"utf8"));
  const r = j.chart.result[0], t = r.timestamp, c = r.indicators.quote[0].close, adj = r.indicators.adjclose?.[0]?.adjclose;
  const px = adj || c; const m = {};
  for (let i=0;i<t.length;i++){ if(px[i]!=null){ const d=new Date(t[i]*1000).toISOString().slice(0,10); m[d]=px[i]; } }
  series[sym] = m;
}
// common dates (present for all)
let dates = Object.keys(series.SPY).sort();
dates = dates.filter(d => TK.every(([s]) => series[s][d] != null));
// daily log returns (%) aligned; first day dropped
const rets = []; const usedDates = [];
for (let i=1;i<dates.length;i++){
  const row = TK.map(([s]) => +(100*Math.log(series[s][dates[i]]/series[s][dates[i-1]])).toFixed(4));
  if (row.every(Number.isFinite)) { rets.push(row); usedDates.push(dates[i]); }
}
const meta = {
  name: "U.S. stock daily returns — “what moves a stock?”",
  source: "Yahoo Finance daily prices, ~2024-06 to 2026-06 (20 large-cap stocks + S&P 500)",
  outcome: "daily return", treatment: "market & sector co-movement",
  note: "Causal-discovery case study: raw returns all correlate because the market is a common cause; remove it and the real sector structure appears — but day-ahead prediction stays elusive (efficient markets).",
};
writeFileSync("data/stocks.js",
  `// AUTO-GENERATED from Yahoo Finance daily prices. Do not edit by hand.\n`+
  `export const meta = ${JSON.stringify(meta)};\n`+
  `export const tickers = ${JSON.stringify(TK.map(([sym,name,sector])=>({sym,name,sector})))};\n`+
  `export const dates = ${JSON.stringify(usedDates)};\n`+
  `export const rets = ${JSON.stringify(rets)};\n`);
console.log(`data/stocks.js  days=${rets.length}  tickers=${TK.length}  bytes=${JSON.stringify(rets).length}`);
