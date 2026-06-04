// Real UC Berkeley 1973 graduate-admissions counts, six largest departments.
// Source: Bickel, Hammel & O'Connell, "Sex Bias in Graduate Admissions:
// Data from Berkeley," Science 187 (1975). The canonical Simpson's-paradox case.
export const meta = {
  name: "UC Berkeley 1973 graduate admissions",
  source: "Bickel, Hammel & O'Connell, Science 1975",
  outcome: "admitted",
  treatment: "gender",
  note: "Aggregate counts, six largest departments",
};
// admitted/applied per department per gender (real published numbers)
export const departments = [
  { dept: "A", men: { applied: 825, admitted: 512 }, women: { applied: 108, admitted: 89 } },
  { dept: "B", men: { applied: 560, admitted: 353 }, women: { applied: 25, admitted: 17 } },
  { dept: "C", men: { applied: 325, admitted: 120 }, women: { applied: 593, admitted: 202 } },
  { dept: "D", men: { applied: 417, admitted: 138 }, women: { applied: 375, admitted: 131 } },
  { dept: "E", men: { applied: 191, admitted: 53 }, women: { applied: 393, admitted: 94 } },
  { dept: "F", men: { applied: 373, admitted: 22 }, women: { applied: 341, admitted: 24 } },
];
// also expose as one row per applicant-group for convenience
export const rows = departments.flatMap((d) => [
  { dept: d.dept, gender: "men", applied: d.men.applied, admitted: d.men.admitted },
  { dept: d.dept, gender: "women", applied: d.women.applied, admitted: d.women.admitted },
]);
