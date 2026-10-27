// Sentinel viz - the profit bridge: revenue down to profit after tax, step by step. Pure.
//
// The bridge ALWAYS ends on the reported profit before tax and profit after tax. Where the reported lines do not
// add up to them (associates, minority interest, a definition that differs) the gap is shown as its own step,
// labelled "Other / unreconciled", rather than quietly absorbed into a cost. Where a line is missing it is worked
// out from the others and marked "implied". So the picture can never show a profit the filing does not.

import type { FinancialStatement } from "../types";

export type BridgeStep = {
  id: string;
  label: string;
  /** For a total: the running total at that point. For a delta: the signed change (a cost is negative). */
  value: number;
  kind: "total" | "delta";
  /** Worked out from other lines, not read. */
  implied?: boolean;
  note?: string;
};

export type Bridge = {
  steps: BridgeStep[];
  /** True when every step was read or implied cleanly, with no "other / unreconciled" step needed. */
  reconciled: boolean;
  notes: string[];
};

type Input = Pick<
  FinancialStatement,
  | "revenue_from_operations" | "other_income" | "total_income" | "total_expenses" | "depreciation_amortisation"
  | "finance_costs" | "exceptional_items" | "profit_before_tax" | "tax_expense" | "profit_after_tax"
>;

// Rounding noise in a filing is a unit or so on the last printed digit: 0.1% of revenue. Anything bigger is shown.
const near = (a: number, b: number, scale: number) => Math.abs(a - b) <= Math.max(Math.abs(scale) * 0.001, 1e-6);
const clean = (v: number) => Number(v.toPrecision(12));

export function buildProfitBridge(s: Input): Bridge | null {
  const rev = s.revenue_from_operations;
  const pbt = s.profit_before_tax;
  const pat = s.profit_after_tax;
  if (![rev, pbt, pat].every((v) => typeof v === "number" && Number.isFinite(v))) return null;

  const notes: string[] = [];
  const steps: BridgeStep[] = [{ id: "revenue", label: "Revenue", value: rev, kind: "total" }];
  let reconciled = true;

  // Other income: read, else the part of total income above revenue, else not shown.
  let other = s.other_income;
  let otherImplied = false;
  if (other == null && s.total_income != null && s.total_income > rev) {
    other = clean(s.total_income - rev);
    otherImplied = true;
  }
  if (other != null && other !== 0) steps.push({ id: "other_income", label: "Other income", value: other, kind: "delta", implied: otherImplied });

  const exceptional = s.exceptional_items ?? 0; // a loss is positive
  const income = rev + (other ?? 0);

  // Costs: read, else implied from the profit the filing reports.
  let costs = s.total_expenses;
  let costsImplied = false;
  if (costs == null) {
    costs = clean(income - exceptional - pbt);
    costsImplied = true;
    notes.push("Total expenses were not on file, so the cost step is worked out from the reported profit before tax.");
  }

  // Split costs into operating, depreciation and finance only when both are known and fit inside the total.
  const da = s.depreciation_amortisation;
  const fin = s.finance_costs;
  if (da != null && fin != null && da + fin <= costs + 1e-9) {
    steps.push({ id: "operating_costs", label: "Operating costs", value: -clean(costs - da - fin), kind: "delta", implied: costsImplied });
    steps.push({ id: "depreciation", label: "Depreciation", value: -da, kind: "delta" });
    steps.push({ id: "finance_costs", label: "Finance costs", value: -fin, kind: "delta" });
  } else {
    steps.push({ id: "costs", label: "Costs", value: -costs, kind: "delta", implied: costsImplied });
  }
  if (exceptional !== 0) steps.push({ id: "exceptional", label: exceptional > 0 ? "Exceptional loss" : "Exceptional gain", value: -exceptional, kind: "delta" });

  const gap = clean(pbt - (income - costs - exceptional));
  if (!near(gap, 0, rev)) {
    reconciled = false;
    steps.push({ id: "unreconciled_pbt", label: "Other / unreconciled", value: gap, kind: "delta", note: "The reported lines do not add up to the reported profit before tax." });
    notes.push("The reported lines above do not add up to the reported profit before tax; the difference is shown as its own step.");
  }
  steps.push({ id: "pbt", label: "Profit before tax", value: pbt, kind: "total" });

  const tax = s.tax_expense ?? clean(pbt - pat);
  const taxImplied = s.tax_expense == null;
  if (tax !== 0) steps.push({ id: "tax", label: "Tax", value: -tax, kind: "delta", implied: taxImplied });
  const gap2 = clean(pat - (pbt - tax));
  if (!near(gap2, 0, rev)) {
    reconciled = false;
    steps.push({ id: "unreconciled_pat", label: "Other (associates, minority, discontinued)", value: gap2, kind: "delta", note: "Profit after tax differs from profit before tax less tax." });
    notes.push("Profit after tax differs from profit before tax less tax (associates, minority interest or discontinued operations); shown as its own step.");
  }
  steps.push({ id: "pat", label: "Profit after tax", value: pat, kind: "total" });
  return { steps, reconciled, notes };
}

/** Floating-bar geometry for a bridge: where each step starts and ends on the value axis. */
export type BridgeBar = BridgeStep & { from: number; to: number };

export function bridgeBars(steps: BridgeStep[]): BridgeBar[] {
  let running = 0;
  return steps.map((s) => {
    if (s.kind === "total") {
      running = s.value;
      return { ...s, from: 0, to: s.value };
    }
    const from = running;
    running = clean(running + s.value);
    return { ...s, from, to: running };
  });
}
