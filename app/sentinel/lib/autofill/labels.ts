// Sentinel autofill - which printed line is which field. Indian financial statements (Ind AS / Schedule III)
// use a small, stable vocabulary, so a rule table does the job deterministically and, unlike a model, gives
// the same answer every time and can say exactly which line it used.
//
// The traps this has to get right (each has a test):
//   "Profit before tax"                        vs  "Profit before exceptional items and tax"
//   "Profit for the year"                      vs  "Profit attributable to owners of the company"
//   "Revenue from operations"                  vs  "Other income" and the sub-lines that explain it
//   "Total equity"                             vs  "Total equity and liabilities" (which equals total assets)
//   "Net cash generated from operating activities" vs "Cash generated from operations" (before tax)
//   "Borrowings", printed once as non-current and once as current, which together are total debt

import type { NumericField } from "../fields";

export type StatementKind = "pl" | "bs" | "cf";

/** Lines that are read for a cross-check or summed into a field, but are not fields themselves. */
export type HelperKey =
  | "pre_exceptional_pbt"
  | "total_non_current_liabilities"
  | "total_equity_and_liabilities"
  | "borrowings"
  | "payables_micro"
  | "payables_other";

export type Target = NumericField | HelperKey;

type Rule = {
  target: Target;
  /** Restrict to one statement; null applies anywhere (spreadsheets often have no statement headings). */
  statement: StatementKind | null;
  pattern: RegExp;
  /** Higher wins when several lines could be the same field. */
  weight: number;
  /** Add every matching line together instead of choosing one (borrowings are printed twice). */
  sum?: boolean;
};

/** Lower-case, drop qualifiers in brackets, "/", numbering and punctuation, so "Profit/(loss) before tax (A)"
 * and "profit before tax" compare equal. */
export function normaliseLabel(raw: string): string {
  let s = raw.toLowerCase();
  // Line enumerators printed in front of a label: "IV. Total expenses", "(a) Cash", "1) Revenue".
  s = s.replace(/^\s*(?:\(?(?:[ivx]{1,4}|[a-f]|\d{1,2})\)|(?:[ivx]{1,4}|[a-f]|\d{1,2})\.)\s+/, "");
  s = s.replace(/\u2019|\u2018|`/g, "'");
  s = s.replace(/\([^)]*\)/g, " "); // (loss), (net), (refer note 35), (A)
  s = s.replace(/\bnote\s*(no\.?)?\s*\d+[a-z]?\b/g, " ");
  s = s.replace(/&/g, " and ");
  s = s.replace(/amortization/g, "amortisation");
  s = s.replace(/[^a-z0-9 ]+/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

const R = (target: Target, statement: StatementKind | null, pattern: RegExp, weight: number, sum = false): Rule => ({ target, statement, pattern, weight, sum });

export const RULES: Rule[] = [
  // ---- profit and loss -------------------------------------------------------------------------
  R("cost_of_goods_sold", "pl", /^(cost of goods sold|cost of sales|cost of revenue|cost of services)$/, 4),
  R("sga_expense", "pl", /^(selling general and administrative expenses?|selling and distribution expenses|sg and a expenses?)$/, 4),
  R("revenue_from_operations", "pl", /^total revenue from operations$/, 5),
  R("revenue_from_operations", "pl", /^revenue from operations$/, 4),
  R("revenue_from_operations", "pl", /^(total )?income from operations$/, 4),
  R("revenue_from_operations", "pl", /^(net )?sales( and other operating income)?$/, 3),
  R("revenue_from_operations", "pl", /^(total )?revenue$/, 2),
  R("other_income", "pl", /^other income$/, 4),
  R("total_income", "pl", /^total income$/, 5),
  R("total_income", "pl", /^total revenue$/, 3),
  R("total_expenses", "pl", /^total expenses$/, 5),
  R("total_expenses", "pl", /^total expenditure$/, 3),
  R("finance_costs", "pl", /^finance costs?$/, 4),
  R("finance_costs", "pl", /^(interest and finance (charges|costs)|finance charges|interest expense|interest and other finance costs)$/, 3),
  R("depreciation_amortisation", "pl", /^depreciation and amortisation( expenses?)?$/, 4),
  R("depreciation_amortisation", "pl", /^depreciation amortisation and impairment( expenses?)?$/, 3),
  R("depreciation_amortisation", "pl", /^depreciation( expenses?)?$/, 2),
  R("exceptional_items", "pl", /^exceptional (items?|gains?|losses?|income|expenses?)( net)?$/, 4),
  R("pre_exceptional_pbt", "pl", /^(profit|loss)( loss)? before exceptional items?( and (share of .+ and )?tax)?$/, 4),
  R("profit_before_tax", "pl", /^profit before tax$/, 5),
  R("profit_before_tax", "pl", /^(loss|profit) before tax$/, 4),
  R("profit_before_tax", "pl", /^profit before (income )?tax( from continuing operations)?$/, 3),
  R("tax_expense", "pl", /^total tax expenses?$/, 5),
  R("tax_expense", "pl", /^(income )?tax expenses?$/, 4),
  R("tax_expense", "pl", /^provision for (income )?tax(ation)?$/, 3),
  R("profit_after_tax", "pl", /^profit for the (year|period)$/, 5),
  R("profit_after_tax", "pl", /^(net )?profit after tax( for the (year|period))?$/, 5),
  R("profit_after_tax", "pl", /^net profit for the (year|period)$/, 4),
  R("profit_after_tax", "pl", /^profit for the (year|period) from continuing operations$/, 2),

  // ---- balance sheet ---------------------------------------------------------------------------
  R("total_assets", "bs", /^total assets$/, 5),
  R("current_assets", "bs", /^total current assets$/, 5),
  R("cash_and_equivalents", "bs", /^cash and cash equivalents$/, 4),
  R("cash_and_equivalents", "bs", /^cash and bank balances$/, 3),
  R("trade_receivables", "bs", /^trade receivables?$/, 4),
  R("trade_receivables", "bs", /^sundry debtors$/, 3),
  R("unbilled_revenue", "bs", /^unbilled revenue$/, 4),
  R("unbilled_revenue", "bs", /^(unbilled receivables|contract assets)$/, 3),
  R("inventory", "bs", /^inventor(y|ies)$/, 4),
  R("retained_earnings", "bs", /^(retained earnings|surplus in statement of profit and loss)$/, 3),
  R("fixed_assets", "bs", /^property plant and equipment$/, 4),
  R("fixed_assets", "bs", /^(net block|fixed assets|tangible assets)$/, 3),
  R("total_equity", "bs", /^total equity$/, 5),
  R("total_equity", "bs", /^total shareholders? funds$/, 4),
  R("total_equity", "bs", /^(shareholders? funds|net worth)$/, 3),
  R("shares_outstanding", "bs", /^(number of )?equity shares outstanding$/, 4),
  R("shares_outstanding", "bs", /^(no\.?|number) of (equity )?shares outstanding$/, 3),
  R("total_non_current_liabilities", "bs", /^total non current liabilities$/, 5),
  R("current_liabilities", "bs", /^total current liabilities$/, 5),
  R("total_liabilities", "bs", /^total liabilities$/, 5),
  R("total_equity_and_liabilities", "bs", /^total (equity and liabilities|liabilities and equity)$/, 5),
  R("trade_payables", "bs", /^trade payables?$/, 4),
  R("trade_payables", "bs", /^sundry creditors$/, 3),
  R("payables_micro", "bs", /^total outstanding dues of micro( and small)? enterprises( and small enterprises)?$/, 4),
  R("payables_other", "bs", /^total outstanding dues of creditors other than micro( and small)? enterprises( and small enterprises)?$/, 4),
  R("borrowings", "bs", /^(short term |long term )?borrowings$/, 3, true),

  // ---- cash flow -------------------------------------------------------------------------------
  R("cash_from_operations", "cf", /^net cash( flows?)?( .*)? operating activities$/, 5),
  R("cash_from_operations", "cf", /^net cash (inflow|outflow) .*operat/, 3),
  R("cash_from_investing", "cf", /^net cash( flows?)?( .*)? investing activities$/, 5),
  R("cash_from_financing", "cf", /^net cash( flows?)?( .*)? financing activities$/, 5),
  R("capex", "cf", /^(purchase|purchases) of property plant and equipment/, 4),
  R("capex", "cf", /^(purchase|purchases) of (fixed|tangible) assets/, 4),
  R("capex", "cf", /^(payments? for|acquisition of) property plant and equipment/, 3),
  R("capex", "cf", /^(capital expenditure|additions to (fixed assets|property plant and equipment))/, 3),

  // ---- the looser names a spreadsheet uses (management accounts, Tally exports, analyst models) ----
  R("ebitda", null, /^(ebitda|operating ebitda|ebitda before exceptional items)$/, 5),
  R("profit_before_tax", null, /^pbt$/, 4),
  R("profit_after_tax", null, /^(pat|net profit|net income|profit after taxation|net profit after tax)$/, 3),
  R("tax_expense", null, /^tax$/, 2),
  R("finance_costs", null, /^(interest|interest cost|interest costs)$/, 2),
  R("depreciation_amortisation", null, /^(d and a|depreciation and amortisation expense)$/, 3),
  R("exceptional_items", null, /^exceptional$/, 3),
  R("total_assets", null, /^total asset$/, 3),
  R("current_assets", null, /^current assets$/, 3),
  R("current_liabilities", null, /^current liabilities$/, 3),
  R("cash_and_equivalents", null, /^(cash|cash and bank)$/, 2),
  R("trade_receivables", null, /^(receivables|debtors|accounts receivable)$/, 2),
  R("trade_payables", null, /^(payables|creditors|accounts payable)$/, 2),
  R("inventory", null, /^(stock|stocks)$/, 2),
  R("fixed_assets", null, /^(net fixed assets|ppe)$/, 3),
  R("total_debt", null, /^(total debt|total borrowings|gross debt|debt)$/, 4),
  R("total_equity", null, /^(equity|shareholders equity|total shareholders equity|net worth)$/, 3),
  R("capex", null, /^(capex|capital expenditure|capital expenditures)$/, 4),
  R("cash_from_operations", null, /^(cfo|operating cash flow|cash flow from operations|cash from operations|cash flows from operations)$/, 3),
  R("cash_from_investing", null, /^(cfi|investing cash flow|cash flow from investing|cash from investing)$/, 3),
  R("cash_from_financing", null, /^(cff|financing cash flow|cash flow from financing|cash from financing)$/, 3),
];

/** Phrases that mean a line is about something else even though a rule's words appear in it. */
const NEVER = /\b(attributable|comprehensive|per share|non controlling|minority|discontinued|segment)\b/;

export type LabelMatch = { target: Target; weight: number; sum: boolean };

/** The best rule for a printed label, or null. `statement` is the statement the line sits in, when known. */
export function matchLabel(label: string, statement: StatementKind | null = null): LabelMatch | null {
  const norm = normaliseLabel(label);
  if (!norm || norm.length > 140) return null;
  if (NEVER.test(norm)) return null;
  let best: LabelMatch | null = null;
  for (const rule of RULES) {
    if (statement && rule.statement && rule.statement !== statement) continue;
    if (!rule.pattern.test(norm)) continue;
    if (!best || rule.weight > best.weight) best = { target: rule.target, weight: rule.weight, sum: !!rule.sum };
  }
  return best;
}

/** Statement headings, for pages and for spreadsheet section rows. */
export function statementOfHeading(text: string): StatementKind | null {
  const t = text.toLowerCase();
  if (/statements?\s+of\s+(consolidated\s+|standalone\s+)?(unaudited\s+|audited\s+)*(profit\s*(and|&)\s*loss|income|financial\s+results)|income statement|profit\s*(and|&)\s*loss account|(unaudited|audited)\s+(consolidated\s+|standalone\s+)?financial\s+results/.test(t)) return "pl";
  if (/balance\s+sheet|statements?\s+of\s+(consolidated\s+|standalone\s+)?financial\s+position/.test(t)) return "bs";
  if (/cash\s+flows?\s+statement|statements?\s+of\s+(consolidated\s+|standalone\s+)?cash\s+flows?|cash\s+flow\s+statement/.test(t)) return "cf";
  return null;
}

/** Names a person might put on a column when each row is one period, mapped to fields. */
export function matchFieldHeader(header: string): NumericField | null {
  const raw = header.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const direct = KEY_ALIASES[raw];
  if (direct) return direct;
  const m = matchLabel(header, null);
  if (m && !isHelper(m.target)) return m.target as NumericField;
  return null;
}

const HELPERS = new Set<string>(["pre_exceptional_pbt", "total_non_current_liabilities", "total_equity_and_liabilities", "borrowings", "payables_micro", "payables_other"]);
export const isHelper = (t: Target): t is HelperKey => HELPERS.has(t);

const KEY_ALIASES: Record<string, NumericField> = {
  revenue_from_operations: "revenue_from_operations", revenue: "revenue_from_operations", sales: "revenue_from_operations", net_sales: "revenue_from_operations",
  other_income: "other_income", total_income: "total_income", total_expenses: "total_expenses", ebitda: "ebitda",
  depreciation_amortisation: "depreciation_amortisation", depreciation: "depreciation_amortisation", "d&a": "depreciation_amortisation",
  finance_costs: "finance_costs", finance_cost: "finance_costs", interest: "finance_costs", exceptional_items: "exceptional_items",
  profit_before_tax: "profit_before_tax", pbt: "profit_before_tax", tax_expense: "tax_expense", tax: "tax_expense",
  profit_after_tax: "profit_after_tax", pat: "profit_after_tax", net_profit: "profit_after_tax",
  total_assets: "total_assets", current_assets: "current_assets", cash_and_equivalents: "cash_and_equivalents", cash: "cash_and_equivalents",
  trade_receivables: "trade_receivables", receivables: "trade_receivables", inventory: "inventory", inventories: "inventory",
  fixed_assets: "fixed_assets", total_liabilities: "total_liabilities", current_liabilities: "current_liabilities",
  trade_payables: "trade_payables", payables: "trade_payables", total_debt: "total_debt", debt: "total_debt", borrowings: "total_debt",
  total_equity: "total_equity", equity: "total_equity", cash_from_operations: "cash_from_operations", cfo: "cash_from_operations",
  cash_from_investing: "cash_from_investing", cfi: "cash_from_investing", cash_from_financing: "cash_from_financing", cff: "cash_from_financing",
  capex: "capex", capital_expenditure: "capex",
  shares_outstanding: "shares_outstanding", shares: "shares_outstanding",
  unbilled_revenue: "unbilled_revenue", unbilled_receivables: "unbilled_revenue", contract_assets: "unbilled_revenue",
};
