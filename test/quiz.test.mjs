// Validate every quiz/<id>.js: schema + answer indices in range.
import { readdirSync } from "fs";
const files = readdirSync("quiz").filter((f) => f.endsWith(".js"));
let fail = 0, total = 0;
for (const f of files) {
  const id = f.replace(/\.js$/, "");
  let mod;
  try { mod = await import(`../quiz/${f}`); }
  catch (e) { console.log(`  FAIL ${id}: import — ${e.message}`); fail++; continue; }
  const qs = mod.questions;
  if (!Array.isArray(qs) || qs.length < 3) { console.log(`  FAIL ${id}: needs >=3 questions`); fail++; continue; }
  let ok = true;
  qs.forEach((q, i) => {
    const where = `${id}[${i}]`;
    if (typeof q.q !== "string" || !q.q) { console.log(`  FAIL ${where}: missing q`); ok = false; }
    if (!Array.isArray(q.choices) || q.choices.length < 2) { console.log(`  FAIL ${where}: needs >=2 choices`); ok = false; }
    const ans = Array.isArray(q.answer) ? q.answer : [q.answer];
    if (!ans.length) { console.log(`  FAIL ${where}: missing answer`); ok = false; }
    for (const a of ans) if (!Number.isInteger(a) || a < 0 || a >= (q.choices?.length || 0)) { console.log(`  FAIL ${where}: answer ${a} out of range`); ok = false; }
    if (typeof q.explain !== "string" || q.explain.length < 10) { console.log(`  FAIL ${where}: weak/missing explain`); ok = false; }
  });
  if (ok) { total += qs.length; console.log(`  ok   ${id} (${qs.length} q)`); } else fail++;
}
console.log(fail ? `\n${fail} quiz file(s) failed` : `\nAll ${files.length} quiz files valid · ${total} questions total`);
process.exit(fail ? 1 : 0);
