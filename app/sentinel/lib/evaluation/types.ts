// Sentinel evaluation - types. Ported from the Python prototype's evaluation/ (scoring.py,
// ground_truth.py), adapted to this app's own extraction shape rather than its IngestResult:
// there is no separate "candidate pages per basis" retrieval stage here (selectStatementPages
// already picks one page set before the model runs) and no abstain status on a field - the
// model always returns its best value and the route separately flags fields it could not
// ground. See scoring.ts for how classify() reads those two differences, and
// docs/sentinel-ground-truth.md for the file format and how to run the CLI.

import type { Basis } from "../types";
import type { NumericField } from "../fields";
import type { CurrencyUnit } from "../units";
import type { GroundingFlag } from "../extraction";

export type AdjudicationStatus = "agree" | "resolved" | "pending" | "disputed";

export type ItemClass =
  | "stated"
  | "unit_converted"
  | "bracketed_negative"
  | "nil_dash"
  | "previous_year_column"
  | "restated_comparative"
  | "multi_page"
  | "absent";

/** The adjudicated answer for one item: either a value in its own printed unit, or absent. */
export type Truth = {
  is_absent: boolean;
  value: number | null;
  unit: CurrencyUnit | null;
  pdf_page: number | null;
};

/** One field, on one filing, that two or more people have labelled. item_id is unique across
 * the whole ground-truth file; filing_id ties it to a Filing and, through that, to the run it
 * is scored against. */
export type GroundTruthItem = {
  item_id: string;
  filing_id: string;
  field: NumericField;
  basis: Basis;
  split: "dev" | "test";
  item_class?: ItemClass | null;
  adjudication: {
    status: AdjudicationStatus;
    reason?: string | null;
    /** How many people independently labelled this item - validateGroundTruth requires at
     * least two before a status of "agree" or "resolved" is trusted. */
    annotations: number;
    truth: Truth;
  };
};

export type Filing = {
  filing_id: string;
  company_id: string;
  /** Total pages in the source PDF, for the pdf_page range check. */
  page_count: number;
};

export type GroundTruth = {
  /** The one company held out of training/tuning - its filings are scored as "test", every
   * other company's filings as "dev". */
  held_out_company: string | null;
  filings: Filing[];
  items: GroundTruthItem[];
};

/** What a single extraction run is scored against: the same fields/low_confidence_fields the
 * route returns, plus the per-field grounding flags from checkGrounding() and the pages the
 * model was shown - built by the caller from one /api/sentinel/extract response (or, for a
 * batch evaluation, from a saved copy of several such responses). */
export type Prediction = {
  filing_id: string;
  fields: Partial<Record<NumericField, number>>;
  low_confidence_fields: NumericField[];
  grounding: Partial<Record<NumericField, GroundingFlag[]>>;
  unit: CurrencyUnit | null;
  pages_used: number[];
};

export const OUTCOMES = ["correct", "wrong_value", "wrong_citation", "missed", "invented", "abstained"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export type ItemRecord = {
  item_id: string;
  filing_id: string;
  company_id: string;
  split: "dev" | "test";
  item_class: string;
  truth_absent: boolean;
  outcome: Outcome;
  /** Whether the filing's true page was among the pages the model read; null when the item
   * has no true page (truth is absent), so absent items never count for or against this. */
  located: boolean | null;
};

export type Summary = {
  n: number;
  counts: Record<Outcome, number>;
  cited_accuracy: number | null;
  cited_accuracy_ci95: [number, number] | null;
  value_accuracy: number | null;
  coverage: number | null;
  precision_accepted: number | null;
  null_accuracy: number | null;
  null_n: number;
  invented: number;
  locate_accuracy: number | null;
  bootstrap_by_filing_ci95?: [number, number] | null;
};
