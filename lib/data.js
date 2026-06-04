// Helpers for working with the real public datasets in data/*.js, plus a
// provenance badge so every interactive visibly shows which real dataset it uses
// and its citation. (The datasets are compiled from public CSVs by
// convert-data.mjs and imported statically — works offline, in the browser and
// in the Node smoke test alike.)

import { h } from "./dom.js";

// Extract one numeric column.
export const col = (rows, key) => rows.map((r) => r[key]);

// Keep only rows where every listed key is present (non-null/undefined/NaN).
export function complete(rows, keys) {
  return rows.filter((r) => keys.every((k) => r[k] != null && !Number.isNaN(r[k])));
}

export function zscore(arr) {
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  const sd = Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, arr.length - 1)) || 1;
  return { z: arr.map((x) => (x - m) / sd), mean: m, sd };
}

// Standardize a set of columns into a design matrix (no intercept).
export function designMatrix(rows, keys) {
  const cols = keys.map((k) => zscore(col(rows, k)).z);
  return rows.map((_, i) => keys.map((__, j) => cols[j][i]));
}

// A small "real data" provenance chip for the panel/caption.
export function dataBadge(meta) {
  const bits = [];
  if (meta.outcome) bits.push("outcome: " + meta.outcome);
  if (meta.treatment) bits.push("treatment: " + meta.treatment);
  if (meta.instrument) bits.push("instrument: " + meta.instrument);
  return h("div", { class: "data-badge" }, [
    h("span", { class: "data-badge-dot" }),
    h("div", {}, [
      h("div", { class: "data-badge-name" }, [
        h("strong", { text: meta.name }),
        h("span", { class: "data-badge-src", text: " · " + meta.source }),
      ]),
      bits.length ? h("div", { class: "data-badge-meta", text: bits.join("  ·  ") }) : null,
    ]),
  ]);
}
