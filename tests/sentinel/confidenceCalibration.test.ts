// calibrationReport: does computeConfidence's score actually track a reviewer's real decision?

import test from "node:test";
import assert from "node:assert/strict";
import { calibrationReport, type DecidedInvestigation } from "../../app/sentinel/lib/evaluation/confidenceCalibration";

const inv = (confidence_score: number | null, status: DecidedInvestigation["status"]): DecidedInvestigation => ({ confidence_score, status });

test("pending and archived investigations are excluded, not guessed at", () => {
  const r = calibrationReport([inv(60, "pending"), inv(70, "archived"), inv(80, "approved")]);
  assert.equal(r.n_decided, 1);
  assert.equal(r.n_excluded, 2);
});

test("edited counts as kept, same as approved; only rejected counts against the score", () => {
  const r = calibrationReport([inv(80, "approved"), inv(80, "edited"), inv(80, "rejected")]);
  const bucket = r.buckets.find((b) => b.label === "70-84")!;
  assert.equal(bucket.n, 3);
  assert.equal(bucket.approved, 2);
  assert.equal(bucket.approved_rate, 2 / 3);
});

test("a confidence_score of null is excluded (no score to calibrate)", () => {
  const r = calibrationReport([inv(null, "approved")]);
  assert.equal(r.n_decided, 0);
  assert.equal(r.overall_approved_rate, null);
});

test("an empty bucket reports n=0 and a null rate, not zero", () => {
  const r = calibrationReport([inv(90, "approved")]);
  const empty = r.buckets.find((b) => b.label === "30-49")!;
  assert.equal(empty.n, 0);
  assert.equal(empty.approved_rate, null);
  assert.equal(empty.approved_rate_ci95, null);
});

test("a boundary score lands in the bucket whose range includes it, not the one above or below", () => {
  const r = calibrationReport([inv(49, "approved"), inv(50, "approved"), inv(84, "approved"), inv(85, "approved")]);
  assert.equal(r.buckets.find((b) => b.label === "30-49")!.n, 1);
  assert.equal(r.buckets.find((b) => b.label === "50-69")!.n, 1);
  assert.equal(r.buckets.find((b) => b.label === "70-84")!.n, 1);
  assert.equal(r.buckets.find((b) => b.label === "85-95")!.n, 1);
});

test("monotonic is true when approval rate rises with confidence", () => {
  const r = calibrationReport([
    inv(40, "rejected"), inv(40, "rejected"), inv(40, "approved"),
    inv(90, "approved"), inv(90, "approved"), inv(90, "rejected"),
  ]);
  assert.equal(r.monotonic, true);
});

test("monotonic is false when a higher bucket approves less often than a lower one", () => {
  const r = calibrationReport([
    inv(90, "rejected"), inv(90, "rejected"), inv(90, "approved"),
    inv(40, "approved"), inv(40, "approved"), inv(40, "rejected"),
  ]);
  assert.equal(r.monotonic, false);
});

test("monotonic is null with fewer than two populated buckets - not enough to say", () => {
  const r = calibrationReport([inv(90, "approved"), inv(92, "rejected")]);
  assert.equal(r.monotonic, null);
});

test("overall_approved_rate is kept over decided, excluding pending/archived and null scores", () => {
  const r = calibrationReport([inv(60, "approved"), inv(60, "rejected"), inv(60, "pending"), inv(null, "approved")]);
  assert.equal(r.n_decided, 2);
  assert.equal(r.overall_approved_rate, 0.5);
});
