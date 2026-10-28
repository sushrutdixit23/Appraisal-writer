// Sentinel evaluation - does computeConfidence's score (anomaly.ts) actually track whether a
// reviewer keeps or discards the finding? That is the only ground truth this app has for "is the
// confidence number any good" - a reviewer approving, editing (keeping, but rewording) or
// rejecting an investigation is a real analyst's verdict, made independently of the score shown
// on screen at the time. "edited" counts as kept: the reviewer judged the finding worth having,
// they just wanted different words for it; only "rejected" means the finding itself was wrong or
// not worth raising. "pending" (no decision yet) and "archived" (withdrawn for reasons that may
// have nothing to do with correctness - a superseded period, a company removed) are excluded
// rather than guessed at.
//
// This mirrors scoring.ts's own posture for the extraction evaluator: report the real numbers
// (bucket size, approval rate, a Wilson interval on it) rather than asserting a target this app
// has no prior basis for. A useful calibration report says "n=4 in the 85-95 bucket is too few to
// conclude anything" just as readily as it says "the top bucket is well-approved" - both are
// honest with a small sample, and asserting a pass/fail threshold this app has never validated
// against real decisions would not be.

import { wilson } from "./scoring";

export type InvestigationStatus = "pending" | "approved" | "edited" | "rejected" | "archived";

/** The only two fields this needs from a real sentinel_investigations row. */
export type DecidedInvestigation = {
  confidence_score: number | null;
  status: InvestigationStatus;
};

export type ConfidenceBucket = { label: string; min: number; max: number };

// computeConfidence's own documented range (anomaly.ts: "Deliberately capped at 95") floored at
// its base score of 45 for a single flag - nothing below that is ever actually produced, so a
// bucket for it would always read n=0.
export const CONFIDENCE_BUCKETS: ConfidenceBucket[] = [
  { label: "30-49", min: 30, max: 49 },
  { label: "50-69", min: 50, max: 69 },
  { label: "70-84", min: 70, max: 84 },
  { label: "85-95", min: 85, max: 95 },
];

export type BucketStat = {
  label: string;
  n: number;
  approved: number;
  approved_rate: number | null;
  approved_rate_ci95: [number, number] | null;
};

export type CalibrationReport = {
  n_decided: number;
  n_excluded: number;
  buckets: BucketStat[];
  overall_approved_rate: number | null;
  // Does the point estimate of approved_rate not fall as confidence rises, across the buckets
  // that have any data? null when fewer than two buckets have data to compare - not enough to
  // say either way, which is a true answer, not a missing one.
  monotonic: boolean | null;
};

const isDecided = (s: InvestigationStatus): s is "approved" | "edited" | "rejected" =>
  s === "approved" || s === "edited" || s === "rejected";
const isKept = (s: InvestigationStatus) => s === "approved" || s === "edited";

export function calibrationReport(investigations: DecidedInvestigation[]): CalibrationReport {
  const decided = investigations.filter((i) => isDecided(i.status) && i.confidence_score != null);
  const buckets: BucketStat[] = CONFIDENCE_BUCKETS.map((b) => {
    const inBucket = decided.filter((i) => i.confidence_score! >= b.min && i.confidence_score! <= b.max);
    const approved = inBucket.filter((i) => isKept(i.status)).length;
    const n = inBucket.length;
    return { label: b.label, n, approved, approved_rate: n ? approved / n : null, approved_rate_ci95: wilson(approved, n) };
  });

  const withData = buckets.filter((b) => b.n > 0);
  let monotonic: boolean | null = null;
  if (withData.length >= 2) {
    monotonic = withData.every((b, i) => i === 0 || (b.approved_rate ?? 0) >= (withData[i - 1].approved_rate ?? 0) - 1e-9);
  }

  const totalApproved = decided.filter((i) => isKept(i.status)).length;
  return {
    n_decided: decided.length,
    n_excluded: investigations.length - decided.length,
    buckets,
    overall_approved_rate: decided.length ? totalApproved / decided.length : null,
    monotonic,
  };
}
