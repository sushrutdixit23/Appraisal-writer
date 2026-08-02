// Sentinel - Review Cycle lifecycle constants. Single source of truth,
// imported by both the Review Cycles list page and the Review Overview
// detail page, so there is exactly one place that has to stay in sync
// if sentinel_review_cycles_status_check or
// sentinel_review_cycles_period_type_check ever change. Values below
// were confirmed directly against the live schema (pg_get_constraintdef),
// not assumed - see the migration history in /areas/sentinel.md for how
// that was verified.

import type { ReviewCyclePeriodType, ReviewCycleStatus } from "./types";

export const PERIOD_TYPES: { value: ReviewCyclePeriodType; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
];

export const LIFECYCLE: { value: ReviewCycleStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "importing", label: "Importing Data" },
  { value: "analyzing", label: "Analyzing" },
  { value: "in_review", label: "In Review" },
  { value: "approved", label: "Approved" },
  { value: "closed", label: "Closed" },
];

export function lifecycleLabel(status: ReviewCycleStatus): string {
  return LIFECYCLE.find((s) => s.value === status)?.label ?? status;
}

export function periodTypeLabel(periodType: ReviewCyclePeriodType): string {
  return PERIOD_TYPES.find((p) => p.value === periodType)?.label ?? periodType;
}

export function nextStatus(status: ReviewCycleStatus): ReviewCycleStatus | null {
  const idx = LIFECYCLE.findIndex((s) => s.value === status);
  if (idx === -1 || idx === LIFECYCLE.length - 1) return null;
  return LIFECYCLE[idx + 1].value;
}
