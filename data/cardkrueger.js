// Real headline figures from Card & Krueger (1994), "Minimum Wages and
// Employment: A Case Study of the Fast-Food Industry in New Jersey and
// Pennsylvania," American Economic Review 84(4). Table 3: average full-time-
// equivalent (FTE) employment per store, before (Feb/Mar 1992) and after
// (Nov/Dec 1992) NJ raised its minimum wage $4.25 → $5.05 (PA unchanged).
export const meta = {
  name: "NJ vs PA fast-food employment",
  source: "Card & Krueger, AER 1994",
  outcome: "FTE employment per store",
  treatment: "NJ minimum-wage increase",
  note: "Difference-in-differences natural experiment",
};
export const cells = {
  NJ: { before: 20.44, after: 21.03 }, // treated
  PA: { before: 23.33, after: 21.17 }, // control
};
// Convenience: the four real means as rows.
export const rows = [
  { group: "NJ", period: "before", fte: 20.44 },
  { group: "NJ", period: "after", fte: 21.03 },
  { group: "PA", period: "before", fte: 23.33 },
  { group: "PA", period: "after", fte: 21.17 },
];
