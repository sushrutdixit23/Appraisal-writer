// Sentinel confidence calibration CLI. Scores computeConfidence's score against real reviewer
// decisions: does a higher confidence actually mean a reviewer is more likely to keep the
// finding? See app/sentinel/lib/evaluation/confidenceCalibration.ts for what counts as "kept".
//
//   npm run score:confidence -- investigations.json
//
// investigations.json is an array of { confidence_score, status } objects - the two columns a
// SQL export of sentinel_investigations needs:
//
//   select confidence_score, status from sentinel_investigations
//   where status in ('approved', 'edited', 'rejected', 'pending', 'archived');
//
// (pending/archived rows are fine to include - they are excluded by the scorer itself, and
// including them lets the report also say how many investigations have no decision yet.)

import { readFileSync } from "node:fs";
import { calibrationReport, type DecidedInvestigation } from "../app/sentinel/lib/evaluation/confidenceCalibration";

function pct(v: number | null): string {
  return v == null ? "-" : `${(v * 100).toFixed(1)}%`;
}

function ci(v: [number, number] | null): string {
  return v ? `[${pct(v[0])}, ${pct(v[1])}]` : "-";
}

function main(): void {
  const [path] = process.argv.slice(2);
  if (!path) {
    console.error("usage: score-confidence <investigations.json>");
    process.exit(2);
  }
  const rows = JSON.parse(readFileSync(path, "utf-8")) as DecidedInvestigation[];
  if (!Array.isArray(rows)) {
    console.error(`${path} must be a JSON array of { confidence_score, status } objects.`);
    process.exit(2);
  }
  const report = calibrationReport(rows);

  console.log(`decided investigations (approved/edited/rejected, with a score): ${report.n_decided}`);
  console.log(`excluded (pending/archived, or no score): ${report.n_excluded}`);
  console.log(`overall kept rate: ${pct(report.overall_approved_rate)}`);
  console.log(
    report.monotonic == null
      ? "monotonic: not enough populated buckets to say"
      : `monotonic (higher confidence -> kept at least as often): ${report.monotonic ? "yes" : "NO - the score is not tracking reviewer decisions as expected"}`
  );
  console.log("\nby confidence bucket");
  for (const b of report.buckets) {
    console.log(`  ${b.label.padEnd(8)} n=${String(b.n).padEnd(4)} kept=${String(b.approved).padEnd(4)} rate=${pct(b.approved_rate).padEnd(7)} 95% CI ${ci(b.approved_rate_ci95)}`);
  }

  if (report.n_decided < 20) {
    console.log(`\nOnly ${report.n_decided} decided investigations - too few to trust these rates yet. Treat this as a dry run of the harness, not a verdict on the score.`);
  }
}

main();
