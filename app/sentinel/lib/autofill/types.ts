// Sentinel autofill - result shapes shared by the PDF reader, the spreadsheet reader, the route and the UI.

import type { NumericField } from "../fields";
import type { CurrencyUnit } from "../units";
import type { Issue } from "../validate";
import type { Basis, PeriodType } from "../types";

export type Confidence = "high" | "medium" | "low";

/** One value placed in one field, with where it came from so a person can check it in seconds. */
export type FieldHit = {
  value: number;
  /** "p.5 | Revenue from operations | 1,000.00  900.00" or "row 12 | Revenue". */
  source: string;
  confidence: Confidence;
  /** Set when the value was worked out from other lines rather than read from one: the formula in words. */
  derived?: string;
};

export type AutofillPeriod = {
  /** Stable key for this column/row in the file (the end date when known). */
  key: string;
  period_type: PeriodType | null;
  period_label: string | null;
  period_end_date: string | null;
  basis: Basis | null;
  fields: Partial<Record<NumericField, FieldHit>>;
  notes: string[];
  /** Accounting checks over the values found (balance sheet, identities). */
  issues: Issue[];
};

export type AutofillUnit = {
  unit: CurrencyUnit | null;
  source: "page" | "sheet" | "none";
  evidence: string | null;
  ambiguous: boolean;
};

export type AutofillResult = {
  kind: "pdf" | "csv" | "xlsx" | "xbrl";
  unit: AutofillUnit;
  /** Most recent first. */
  periods: AutofillPeriod[];
  notes: string[];
  pages_used: number[];
  /** How a spreadsheet was read: "line items down, periods across" or "one row per period". */
  layout: string | null;
  source_file: string;
  /** The auditor's own Key Audit Matters paragraph(s), verbatim - PDFs only; null for a sheet,
   * and null for a PDF with no such section found. Carried through to the saved statement so the
   * investigation narrative can cite the real text instead of only a page pointer. */
  key_audit_matters_text: string | null;
};

export class AutofillError extends Error {}

export type AutofillOptions = {
  preferredBasis?: Basis | null;
  /** FY, Q1..Q4, or null to work it out from the file. */
  periodType?: PeriodType | null;
  fyStartMonth?: number;
  sourceFile?: string;
  /** A trial balance carries no period heading: the caller (a data request) says which period it is for. */
  periodEndDate?: string | null;
};
