// Sentinel autofill - values that are worked out from other printed lines, not read from one. Every one
// is labelled "derived" with its formula, and given low confidence, because a person should look at it.

import type { NumericField } from "../fields";
import { checkDraft } from "../extraction";
import type { Confidence, FieldHit } from "./types";
import type { Issue } from "../validate";

export type Raw = Partial<Record<string, FieldHit>>;

const near = (a: number, b: number, tol = 0.5) => Math.abs(a - b) <= Math.max(tol, Math.abs(b) * 0.005);
const derivedHit = (value: number, sources: string[], formula: string, confidence: Confidence = "low"): FieldHit => ({
  value,
  source: sources.join(" ; "),
  confidence,
  derived: formula,
});

/** Fill what can be worked out, fix the sign of exceptional items against the printed profit lines, and
 * report what was done. `raw` holds the best line found per target, including the helper lines. */
export function deriveFields(raw: Raw): { fields: Partial<Record<NumericField, FieldHit>>; notes: string[] } {
  const notes: string[] = [];
  const f: Partial<Record<NumericField, FieldHit>> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v && !HELPER_KEYS.has(k)) f[k as NumericField] = v;
  }
  const v = (k: string) => raw[k]?.value;

  // Exceptional items. The statement prints them as an expense (positive) or a gain, and a person copying
  // by eye gets the sign wrong; the printed profit lines settle it: pre-exceptional profit - exceptional
  // items = profit before tax.
  const pre = v("pre_exceptional_pbt");
  const pbt = v("profit_before_tax");
  if (pre != null && pbt != null) {
    const implied = Math.round((pre - pbt) * 100) / 100;
    const printed = raw["exceptional_items"];
    if (printed && near(Math.abs(printed.value), Math.abs(implied))) {
      if (!near(printed.value, implied)) notes.push(`Exceptional items were printed as ${printed.value} but the profit lines (${pre} before, ${pbt} after) show ${implied}; the sign was set to match.`);
      f.exceptional_items = { ...printed, value: implied, derived: near(printed.value, implied) ? undefined : "sign set so that profit before exceptional items - exceptional items = profit before tax" };
    } else if (!printed && Math.abs(implied) > 0.005) {
      f.exceptional_items = derivedHit(implied, [raw["pre_exceptional_pbt"]!.source, raw["profit_before_tax"]!.source], "profit before exceptional items - profit before tax");
    } else if (printed) {
      notes.push(`Exceptional items (${printed.value}) do not match the gap between profit before and after them (${implied}); check the sign and the lines.`);
    }
  }

  // Total liabilities (excluding equity): printed, or the two printed sub-totals, or assets less equity.
  if (!f.total_liabilities) {
    const ncl = raw["total_non_current_liabilities"], cl = raw["current_liabilities"];
    const tel = raw["total_equity_and_liabilities"], eq = raw["total_equity"], ta = raw["total_assets"];
    if (ncl && cl) f.total_liabilities = derivedHit(ncl.value + cl.value, [ncl.source, cl.source], "total non-current liabilities + total current liabilities");
    else if (tel && eq) f.total_liabilities = derivedHit(tel.value - eq.value, [tel.source, eq.source], "total equity and liabilities - total equity");
    else if (ta && eq) f.total_liabilities = derivedHit(ta.value - eq.value, [ta.source, eq.source], "total assets - total equity");
  }

  // Total debt: every "Borrowings" line, summed (non-current and current are printed separately).
  if (!f.total_debt && raw["borrowings"]) {
    const b = raw["borrowings"]!;
    f.total_debt = derivedHit(b.value, [b.source], "borrowings lines added together (non-current + current); lease liabilities and current maturities of other lines are not included", "low");
  }

  // Trade payables printed as two sub-lines (micro/small enterprises, and others).
  if (!f.trade_payables && (raw["payables_micro"] || raw["payables_other"])) {
    const a = raw["payables_micro"], b = raw["payables_other"];
    f.trade_payables = derivedHit((a?.value ?? 0) + (b?.value ?? 0), [a?.source, b?.source].filter(Boolean) as string[], "dues to micro and small enterprises + dues to other creditors", a && b ? "medium" : "low");
  }

  // Tax printed as a "Current tax" line and a "Deferred tax" line with no total: their sum (deferred is often a bracketed credit).
  if (!f.tax_expense && raw["tax_current"] && raw["tax_deferred"]) {
    const a = raw["tax_current"]!, b = raw["tax_deferred"]!;
    f.tax_expense = derivedHit(Math.round((a.value + b.value) * 100) / 100, [a.source, b.source], "current tax + deferred tax", "medium");
  }

  // Capex is entered as a positive amount; the cash-flow statement prints the outflow in brackets.
  if (f.capex && f.capex.value < 0) f.capex = { ...f.capex, value: Math.abs(f.capex.value), derived: "sign dropped: capex is entered as a positive amount" };

  // EBITDA is not a statutory line. Offered as PBT + exceptional + finance costs + D&A - other income, and
  // said to be derived, so nobody mistakes it for a reported figure.
  if (!f.ebitda && f.profit_before_tax && f.finance_costs && f.depreciation_amortisation) {
    const ex = f.exceptional_items?.value ?? 0;
    const oi = f.other_income?.value ?? 0;
    const value = f.profit_before_tax.value + ex + f.finance_costs.value + f.depreciation_amortisation.value - oi;
    f.ebitda = derivedHit(
      Math.round(value * 100) / 100,
      [f.profit_before_tax.source, f.finance_costs.source, f.depreciation_amortisation.source],
      "profit before tax + exceptional items + finance costs + depreciation and amortisation - other income (EBITDA is not printed; the company's own definition may differ)"
    );
  }
  return { fields: f, notes };
}

const HELPER_KEYS = new Set(["pre_exceptional_pbt", "total_non_current_liabilities", "total_equity_and_liabilities", "borrowings", "payables_micro", "payables_other", "tax_current", "tax_deferred"]);

/** Accounting checks over the filled values; every field involved in a failed check drops to low confidence. */
export function checkAndDowngrade(fields: Partial<Record<NumericField, FieldHit>>): Issue[] {
  const values: Partial<Record<NumericField, number>> = {};
  for (const [k, hit] of Object.entries(fields)) if (hit) values[k as NumericField] = hit.value;
  const issues = checkDraft(values);
  for (const issue of issues) {
    for (const key of issue.fields) {
      const hit = fields[key];
      if (hit && hit.confidence !== "low") fields[key] = { ...hit, confidence: "low" };
    }
  }
  return issues;
}
