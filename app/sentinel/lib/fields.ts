// Sentinel - the one list of statement fields. The New Project form, the
// Manage Periods form, the legacy Data Entry page, the PDF extraction
// prompt and the save validation all read from here, so a field cannot
// exist in one entry path and be missing from another (before this, the
// Cash Flow fields were saved and extracted but had no input anywhere, and
// four balance-sheet fields existed only on the legacy page).

import type { FinancialStatement } from "./types";

export type NumericField = keyof Pick<
  FinancialStatement,
  | "revenue_from_operations" | "other_income" | "total_income" | "total_expenses" | "ebitda"
  | "depreciation_amortisation" | "finance_costs" | "exceptional_items" | "profit_before_tax"
  | "tax_expense" | "profit_after_tax" | "total_assets" | "current_assets" | "cash_and_equivalents"
  | "trade_receivables" | "inventory" | "fixed_assets" | "total_liabilities" | "current_liabilities"
  | "trade_payables" | "total_debt" | "total_equity" | "cash_from_operations" | "cash_from_investing"
  | "cash_from_financing" | "capex"
>;

export type FieldDef = {
  key: NumericField;
  label: string;
  required?: boolean;
  /** Shown under the input where the sign convention is not obvious. */
  hint?: string;
};

export type FieldSection = { id: "income" | "balance" | "cashflow"; title: string; fields: FieldDef[] };

export const FIELD_SECTIONS: FieldSection[] = [
  {
    id: "income",
    title: "Income statement",
    fields: [
      { key: "revenue_from_operations", label: "Revenue from operations", required: true },
      { key: "other_income", label: "Other income" },
      { key: "total_income", label: "Total income" },
      { key: "total_expenses", label: "Total expenses", hint: "As reported, including finance costs and depreciation" },
      { key: "ebitda", label: "EBITDA" },
      { key: "depreciation_amortisation", label: "Depreciation & amortisation" },
      { key: "finance_costs", label: "Finance costs" },
      {
        key: "exceptional_items",
        label: "Exceptional items",
        hint: "A loss or expense is positive, a gain is negative",
      },
      { key: "profit_before_tax", label: "Profit before tax", required: true, hint: "After exceptional items; a loss is negative" },
      { key: "tax_expense", label: "Tax expense" },
      { key: "profit_after_tax", label: "Profit after tax", required: true, hint: "A loss is negative" },
    ],
  },
  {
    id: "balance",
    title: "Balance sheet",
    fields: [
      { key: "total_assets", label: "Total assets" },
      { key: "current_assets", label: "Current assets" },
      { key: "cash_and_equivalents", label: "Cash & equivalents" },
      { key: "trade_receivables", label: "Trade receivables" },
      { key: "inventory", label: "Inventory" },
      { key: "fixed_assets", label: "Fixed assets" },
      { key: "total_liabilities", label: "Total liabilities", hint: "Excluding equity" },
      { key: "current_liabilities", label: "Current liabilities" },
      { key: "trade_payables", label: "Trade payables" },
      { key: "total_debt", label: "Total debt", hint: "Current and non-current borrowings" },
      { key: "total_equity", label: "Total equity" },
    ],
  },
  {
    id: "cashflow",
    title: "Cash flow",
    fields: [
      { key: "cash_from_operations", label: "Cash from operations", hint: "Inflows positive, outflows negative" },
      { key: "cash_from_investing", label: "Cash from investing", hint: "Inflows positive, outflows negative" },
      { key: "cash_from_financing", label: "Cash from financing", hint: "Inflows positive, outflows negative" },
      { key: "capex", label: "Capital expenditure", hint: "Enter as a positive amount" },
    ],
  },
];

export const ALL_FIELDS: FieldDef[] = FIELD_SECTIONS.flatMap((s) => s.fields);
export const ALL_FIELD_KEYS: NumericField[] = ALL_FIELDS.map((f) => f.key);
export const REQUIRED_FIELD_KEYS: NumericField[] = ALL_FIELDS.filter((f) => f.required).map((f) => f.key);

export const PERIOD_TYPES = ["FY", "Q1", "Q2", "Q3", "Q4"] as const;
export const BASES = ["standalone", "consolidated"] as const;

// ---------------------------------------------------------------------------------------------
// Number entry. Figures are pasted from filings and spreadsheets as "1,234.5", "(123.4)" for a
// negative, with a unicode minus, or with a stray rupee sign or trailing "cr". A type="number"
// input silently empties on those. This accepts them, and tells "left blank" apart from "typed
// something that is not a number" so the second is an error rather than a quiet null.
// ---------------------------------------------------------------------------------------------

export type ParsedNumber = { value: number | null; invalid: boolean };

export function parseNumberInput(raw: string | number | null | undefined): ParsedNumber {
  if (raw == null) return { value: null, invalid: false };
  if (typeof raw === "number") return Number.isFinite(raw) ? { value: raw, invalid: false } : { value: null, invalid: true };
  let t = raw.trim();
  if (t === "" || t === "-" || t === "—" || t === "–") return { value: null, invalid: false };
  let negative = false;
  if (/^\(.*\)$/.test(t)) {
    negative = true;
    t = t.slice(1, -1);
  }
  t = t.replace(/[−–—]/g, "-").replace(/[₹\s]/g, "").replace(/^rs\.?/i, "");
  t = t.replace(/(?:cr|crore|crores|lakh|lakhs|mn|million)$/i, "");
  if (t.startsWith("-")) {
    negative = !negative;
    t = t.slice(1);
  }
  // Thousands separators: Western 1,234,567.8 and Indian 12,34,567.8 are both fine. A lone comma
  // that is not a grouping ("1,5", "1,23") is rejected rather than guessed at - it is more often
  // a decimal comma than a thousand.
  const grouped = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) || /^\d{1,2}(,\d{2})*,\d{3}(\.\d+)?$/.test(t);
  if (!grouped && !/^\d+(\.\d+)?$|^\.\d+$/.test(t)) return { value: null, invalid: true };
  const n = Number(t.replace(/,/g, ""));
  if (!Number.isFinite(n)) return { value: null, invalid: true };
  return { value: negative ? -n : n, invalid: false };
}

/** Form text -> numbers. Returns the values plus the labels of any field that held text which is
 * not a number. Blank fields come back null. */
export function parseFormValues(values: Record<string, string>): {
  numbers: Record<NumericField, number | null>;
  invalid: string[];
} {
  const numbers = {} as Record<NumericField, number | null>;
  const invalid: string[] = [];
  for (const f of ALL_FIELDS) {
    const p = parseNumberInput(values[f.key]);
    numbers[f.key] = p.value;
    if (p.invalid) invalid.push(f.label);
  }
  return { numbers, invalid };
}

/** Existing statement -> form text (null/undefined stay blank). */
export function statementToFormValues(stmt: Partial<Record<string, unknown>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ALL_FIELD_KEYS) {
    const v = stmt[key];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = String(v);
  }
  return out;
}
