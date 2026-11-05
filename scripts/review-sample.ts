// The outside-review pack: a reproducible sample of the findings sheet for a reviewer to mark, an overlap for a second reviewer, and the agreement between two
// reviewers. See docs/scorecard/REVIEWER-GUIDE.md.
//
//   npm run review:sample -- <items.csv> [--n 100] [--overlap 30] [--seed 20261105] [--out review-pack]
//        writes reviewer-A.csv (the sample), reviewer-B.csv (the overlap, for a second person) and manifest.json (seed and counts per reader)
//   npm run review:sample -- --agreement <reviewer-A-marked.csv> <reviewer-B-marked.csv>
//        prints raw agreement, Cohen's kappa and the items the two reviewers marked differently
//   npm run score:notes -- --marked reviewer-A-marked.csv
//        precision per reader from the marked sample

import fs from "node:fs";
import path from "node:path";
import { agreement, drawSample, parseCsv, writeCsv } from "../app/sentinel/lib/evaluation/reviewSample";

const argv = process.argv.slice(2);
const flag = (name: string, fallback?: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const pct = (v: number | null) => (v == null ? "n/a" : `${(v * 100).toFixed(0)}%`);

if (argv.includes("--agreement")) {
  const [a, b] = argv.slice(argv.indexOf("--agreement") + 1).filter((x) => !x.startsWith("--"));
  if (!a || !b) { console.error("Usage: --agreement <reviewer-A-marked.csv> <reviewer-B-marked.csv>"); process.exit(1); }
  const r = agreement(parseCsv(fs.readFileSync(a, "utf8")), parseCsv(fs.readFileSync(b, "utf8")));
  console.log(`Items marked by both: ${r.n}`);
  console.log(`Agreed: ${r.agree} (${pct(r.rate)}${r.interval ? `, 95% interval ${pct(r.interval[0])}-${pct(r.interval[1])}` : ""})`);
  console.log(`Cohen's kappa: ${r.kappa == null ? "undefined (no variation in the verdicts)" : r.kappa.toFixed(2)}`);
  for (const d of r.disagreements) console.log(`  differ: ${d.key.split("|").slice(0, 4).join(" | ")}  A=${d.a}  B=${d.b}`);
  process.exit(0);
}

const items = argv.find((x) => !x.startsWith("--") && !/^\d+$/.test(x) && x !== flag("out") && x !== flag("seed"));
if (!items) { console.error("Usage: npm run review:sample -- <items.csv> [--n 100] [--overlap 30] [--seed 20261105] [--out review-pack]"); process.exit(1); }
const n = Number(flag("n", "100")), overlap = Number(flag("overlap", "30")), seed = Number(flag("seed", "20261105")), out = flag("out", "review-pack")!;
const sample = drawSample(parseCsv(fs.readFileSync(items, "utf8")), n, overlap, seed);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "reviewer-A.csv"), writeCsv(sample.sheet));
fs.writeFileSync(path.join(out, "reviewer-B.csv"), writeCsv(sample.overlap));
fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify({ source: path.basename(items), seed: sample.seed, n: sample.sheet.rows.length, overlap: sample.overlap.rows.length, per_reader: sample.perReader }, null, 2) + "\n");
console.log(`Wrote ${sample.sheet.rows.length} rows to ${out}/reviewer-A.csv and ${sample.overlap.rows.length} to ${out}/reviewer-B.csv (seed ${seed}).`);
for (const [k, v] of Object.entries(sample.perReader)) console.log(`  ${k}: ${v.sampled} of ${v.available}`);
