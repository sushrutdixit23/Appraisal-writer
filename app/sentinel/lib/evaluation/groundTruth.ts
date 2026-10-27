// Sentinel evaluation - loading and validating a ground-truth file. Ported from the Python
// prototype's evaluation/ground_truth.py; the rules below mirror validate() there, minus the
// checks for fields this app does not track (statement name, period_column, value_as_printed -
// see types.ts for why).

import { ALL_FIELD_KEYS } from "../fields";
import type { GroundTruth, GroundTruthItem, ItemClass } from "./types";

export const CLASSES = new Set<ItemClass>([
  "stated",
  "unit_converted",
  "bracketed_negative",
  "nil_dash",
  "previous_year_column",
  "restated_comparative",
  "multi_page",
  "absent",
]);

export const BASES = new Set(["standalone", "consolidated"]);
export const SCORED_STATUSES = new Set(["agree", "resolved"]);

export function isScored(item: GroundTruthItem): boolean {
  return SCORED_STATUSES.has(item.adjudication.status);
}

export function scoredItems(gt: GroundTruth): GroundTruthItem[] {
  return gt.items.filter(isScored);
}

/** Problems found, as "<item_id>: <message>" strings (file-level problems have no prefix).
 * Empty means the file is fit to score. `companyIds`, when given, is the peer set the filings
 * are meant to be drawn from - pass it to catch a filing that has drifted onto a company no
 * longer tracked. */
export function validateGroundTruth(gt: GroundTruth, companyIds?: Set<string>): string[] {
  const errs: string[] = [];

  const filingIds = gt.filings.map((f) => f.filing_id);
  if (new Set(filingIds).size !== filingIds.length) errs.push("duplicate filing_id");
  const itemIds = gt.items.map((i) => i.item_id);
  if (new Set(itemIds).size !== itemIds.length) errs.push("duplicate item_id");

  const filings = new Map(gt.filings.map((f) => [f.filing_id, f]));
  if (companyIds) {
    for (const f of gt.filings) {
      if (!companyIds.has(f.company_id)) errs.push(`${f.filing_id}: company_id not in the peer set`);
    }
  }
  if (gt.held_out_company == null) errs.push("held_out_company is not set");

  for (const item of gt.items) {
    const bad = (message: string) => errs.push(`${item.item_id}: ${message}`);

    const filing = filings.get(item.filing_id);
    if (!filing) {
      bad("unknown filing_id");
      continue;
    }
    if (!(ALL_FIELD_KEYS as readonly string[]).includes(item.field)) bad("field not recognised");
    if (!BASES.has(item.basis)) bad("bad basis");
    const expectedSplit = filing.company_id === gt.held_out_company ? "test" : "dev";
    if (item.split !== expectedSplit) bad(`split should be ${expectedSplit}`);
    if (item.item_class != null && !CLASSES.has(item.item_class)) bad("bad item_class");

    if (isScored(item)) {
      const { truth } = item.adjudication;
      if (item.adjudication.annotations < 2) bad("scored item needs two annotations");
      if (truth.is_absent !== (truth.value == null)) bad("is_absent must be true iff value is null");
      if (!truth.is_absent && !truth.unit) bad("unit is required unless the item is absent");
      if (truth.pdf_page != null && !(truth.pdf_page >= 1 && truth.pdf_page <= filing.page_count)) {
        bad("pdf_page outside 1..page_count");
      }
      if (item.adjudication.status === "resolved" && !item.adjudication.reason) bad("resolved needs a reason");
      if (item.item_class === "nil_dash" && truth.value !== 0) bad("nil_dash implies value 0");
      if (item.item_class === "absent" && !truth.is_absent) bad("absent class implies is_absent");
    }
  }
  return errs;
}
