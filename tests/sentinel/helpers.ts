// Shared builders for the Sentinel tests. Every figure used in a test is a
// round, hand-checkable number so the expected value can be worked out on
// paper rather than copied from the code under test.

import type { FinancialStatement, Workspace } from "../../app/sentinel/lib/types";

export function ws(id: string, over: Partial<Workspace> = {}): Workspace {
  return {
    id,
    owner_id: null,
    company_name: id.toUpperCase(),
    sector: "tyre",
    industry: null,
    is_public_reference: true,
    fiscal_year_start_month: 4,
    currency: "INR",
    currency_unit: "INR_CRORE",
    comparison_basis: "consolidated",
    ...over,
  };
}

export function st(workspace_id: string, over: Partial<FinancialStatement> = {}): FinancialStatement {
  return {
    workspace_id,
    review_cycle_id: null,
    period_type: "FY",
    period_label: "FY26",
    period_end_date: "2026-03-31",
    basis: "consolidated",
    revenue_from_operations: 1000,
    other_income: null,
    total_income: null,
    total_expenses: null,
    ebitda: null,
    depreciation_amortisation: null,
    finance_costs: null,
    exceptional_items: null,
    profit_before_tax: 100,
    tax_expense: null,
    profit_after_tax: 80,
    total_assets: null,
    current_assets: null,
    cash_and_equivalents: null,
    trade_receivables: null,
    inventory: null,
    fixed_assets: null,
    total_liabilities: null,
    current_liabilities: null,
    trade_payables: null,
    total_debt: null,
    total_equity: null,
    cash_from_operations: null,
    cash_from_investing: null,
    cash_from_financing: null,
    capex: null,
    source_file: "test",
    source_page: null,
    extraction_notes: null,
    ...over,
  };
}

/** Compare floats without caring about representation error. */
export function near(actual: number | null | undefined, expected: number, tolerance = 1e-9): boolean {
  return actual != null && Math.abs(actual - expected) <= tolerance;
}
