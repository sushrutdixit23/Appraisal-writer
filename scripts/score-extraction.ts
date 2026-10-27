// Sentinel evaluation CLI. Scores a set of /api/sentinel/extract runs against a hand-labelled
// ground-truth file and prints the report scoring.ts produces (see docs/sentinel-ground-truth.md
// for both files' shape). Exits 1 if the ground-truth file fails validation, or if the test-split
// pre-registered targets (T1-T4) are not all met - so this can gate a CI job once a labelled set
// exists, the same way the Python prototype's own evaluation script did.
//
//   npm run score:extraction -- ground-truth.json predictions.json
//
// predictions.json is an array of Prediction objects: one per filing, in the shape this app's
// extract route already returns plus the two fields that are not in its JSON response today -
// see the Prediction type in app/sentinel/lib/evaluation/types.ts for exactly what is needed
// (fields, low_confidence_fields, unit straight from the response; grounding and pages_used
// saved separately, since the route does not put them on the wire - see that file's comment).

import { readFileSync } from "node:fs";
import { validateGroundTruth } from "../app/sentinel/lib/evaluation/groundTruth";
import { score, type ScoreReport } from "../app/sentinel/lib/evaluation/scoring";
import type { GroundTruth, Prediction, Summary } from "../app/sentinel/lib/evaluation/types";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function pct(v: number | null | undefined): string {
  return v == null ? "-" : `${(v * 100).toFixed(1)}%`;
}

function ci(v: [number, number] | null | undefined): string {
  return v ? `[${pct(v[0])}, ${pct(v[1])}]` : "-";
}

function printSummary(name: string, s: Summary): void {
  console.log(`\n${name}  (n=${s.n})`);
  console.log(`  cited accuracy      ${pct(s.cited_accuracy)}  95% CI ${ci(s.cited_accuracy_ci95)}`);
  if (s.bootstrap_by_filing_ci95) console.log(`  bootstrap (by filing)              95% CI ${ci(s.bootstrap_by_filing_ci95)}`);
  console.log(`  coverage             ${pct(s.coverage)}   (accepted, i.e. not abstained)`);
  console.log(`  precision, accepted  ${pct(s.precision_accepted)}`);
  console.log(`  value accuracy       ${pct(s.value_accuracy)}  (correct + wrong_citation)`);
  console.log(`  locate accuracy      ${pct(s.locate_accuracy)}`);
  console.log(`  null accuracy        ${pct(s.null_accuracy)}  (n=${s.null_n})`);
  console.log(`  invented             ${s.invented}`);
  console.log(`  outcomes             ${Object.entries(s.counts).map(([k, v]) => `${k}=${v}`).join("  ")}`);
}

function printReport(report: ScoreReport): void {
  for (const name of ["all", "test", "dev"] as const) printSummary(name, report.groups[name]);

  console.log("\nby company");
  for (const [c, s] of Object.entries(report.by_company)) console.log(`  ${c.padEnd(16)} n=${s.n}  cited=${pct(s.cited_accuracy)}  coverage=${pct(s.coverage)}`);

  console.log("\nby item class");
  for (const [k, s] of Object.entries(report.by_class)) console.log(`  ${k.padEnd(22)} n=${s.n}  cited=${pct(s.cited_accuracy)}`);

  console.log("\ntargets on the test split");
  for (const [k, t] of Object.entries(report.targets_on_test)) {
    const value = typeof t.value === "number" && t.value < 1 && t.value > 0 ? pct(t.value) : String(t.value);
    console.log(`  ${(t.passed ? "PASS" : "FAIL").padEnd(5)} ${k.padEnd(28)} ${value}`);
  }
}

function main(): void {
  const [gtPath, predictionsPath] = process.argv.slice(2);
  if (!gtPath || !predictionsPath) {
    console.error("usage: score-extraction <ground-truth.json> <predictions.json>");
    process.exit(2);
  }

  const gt = readJson<GroundTruth>(gtPath);
  const errors = validateGroundTruth(gt);
  if (errors.length > 0) {
    console.error(`${gtPath} failed validation:`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }

  const predictions = readJson<Prediction[]>(predictionsPath);
  const report = score(gt, predictions);
  printReport(report);

  const failed = Object.entries(report.targets_on_test).filter(([, t]) => !t.passed);
  if (failed.length > 0) {
    console.error(`\n${failed.length} target(s) not met: ${failed.map(([k]) => k).join(", ")}`);
    process.exit(1);
  }
}

main();
