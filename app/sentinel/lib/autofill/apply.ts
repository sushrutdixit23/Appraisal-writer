// Sentinel autofill - from a detected period to form values. Pure.
//
// Figures are converted from the file's unit to the company's reporting unit (a lakh sheet into a crore
// company is 100x smaller), so what lands in the form is already in the unit the form says it is in. Fields
// that were derived, or read with low confidence, come back in `verify` so the form marks them.

import { ALL_FIELD_KEYS } from "../fields";
import { convertAmount, normaliseUnit, unitLabel, type CurrencyUnit } from "../units";
import type { AutofillPeriod, AutofillResult } from "./types";

export type AppliedPeriod = {
  values: Record<string, string>;
  /** One short caption per filled field: where it was read, or how it was worked out. */
  sources: Record<string, string>;
  verify: string[];
  unitNote: string | null;
};

/** Short caption for a field's provenance. */
export function describeSource(hit: { source: string; derived?: string }): string {
  return hit.derived ? `Worked out: ${hit.derived}. From ${hit.source}` : `Read from ${hit.source}`;
}

export function applyAutofillPeriod(
  period: AutofillPeriod,
  fileUnit: CurrencyUnit | null,
  workspaceUnit: string | null | undefined
): AppliedPeriod {
  const to = normaliseUnit(workspaceUnit) ?? "INR_CRORE";
  const values: Record<string, string> = {};
  const sources: Record<string, string> = {};
  const verify: string[] = [];
  let converted = false;
  for (const key of ALL_FIELD_KEYS) {
    const hit = period.fields[key];
    if (!hit || !Number.isFinite(hit.value)) continue;
    if (fileUnit && fileUnit !== to) {
      values[key] = String(convertAmount(hit.value, fileUnit, to));
      converted = true;
    } else {
      values[key] = String(hit.value);
    }
    sources[key] = describeSource(hit);
    if (hit.confidence === "low" || hit.derived) verify.push(key);
  }
  let unitNote: string | null = null;
  if (!fileUnit) {
    unitNote = `The file does not state its unit, so the figures are entered exactly as they appear. This company reports in ${unitLabel(to)}; convert them first if the file uses another unit.`;
  } else if (converted) {
    unitNote = `The file is in ${unitLabel(fileUnit)}; the figures were converted to ${unitLabel(to)}, this company's reporting unit.`;
  }
  return { values, sources, verify, unitNote };
}

/** The period to offer first: the newest one that has the most figures. */
export function defaultPeriod(result: AutofillResult): AutofillPeriod | null {
  if (result.periods.length === 0) return null;
  return [...result.periods].sort((a, b) => {
    const da = Object.keys(a.fields).length, db = Object.keys(b.fields).length;
    if (Math.abs(da - db) > 3) return db - da; // a column with far more figures is the real statement
    return (b.period_end_date ?? "").localeCompare(a.period_end_date ?? "");
  })[0];
}

/** How many figures a period found, for the picker. */
export const countFields = (p: AutofillPeriod) => Object.keys(p.fields).length;
