// Sentinel - statement validation, shared by every way a statement can be
// saved. The server route (/api/sentinel/statement) and both browser
// forms (New Project, Manage Periods) run the same two steps, so a figure
// that is refused on one path cannot be accepted on another:
//
//   1. coerceStatement - take untrusted input, keep ONLY known columns,
//      check types and enums, return a clean row. Anything not on the
//      list (an `id`, a `workspace_id`, a `review_cycle_id`, a typo) is
//      dropped rather than written through to the database.
//   2. validateStatement - accounting checks. Hard errors block the save;
//      warnings are returned beside a successful save.

import {
  ALL_FIELD_KEYS,
  BASES,
  PERIOD_TYPES,
  REQUIRED_FIELD_KEYS,
  parseFormValues,
  parseNumberInput,
  type NumericField,
} from "./fields";
import type { Basis, PeriodType } from "./types";

export type StatementRow = {
  period_type: PeriodType;
  period_label: string;
  period_end_date: string;
  basis: Basis;
  source_file: string;
  source_page: string | null;
  extraction_notes: string | null;
} & Record<NumericField, number | null>;

/** One finding, with the fields it is about so a form can highlight them. */
export type Issue = { severity: "error" | "warning"; message: string; fields: NumericField[] };

export type Validation = { errors: string[]; warnings: string[]; issues: Issue[] };

/** Other statements already on file for the same company. */
export type OtherStatement = {
  id?: string;
  period_type?: string | null;
  period_label: string;
  period_end_date: string;
  basis?: string | null;
  revenue_from_operations: number | null;
};

function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function coerceStatement(raw: unknown): { row: StatementRow | null; errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { row: null, errors: ["Missing statement payload."] };
  }
  const input = raw as Record<string, unknown>;

  const text = (key: string, max: number): string | null => {
    const v = input[key];
    if (v == null) return null;
    if (typeof v !== "string") {
      errors.push(`${key} must be text.`);
      return null;
    }
    const t = v.trim();
    if (t.length > max) {
      errors.push(`${key} is too long (maximum ${max} characters).`);
      return null;
    }
    return t === "" ? null : t;
  };

  const periodType = text("period_type", 4);
  if (!periodType) errors.push("Missing required statement field: period_type");
  else if (!(PERIOD_TYPES as readonly string[]).includes(periodType)) {
    errors.push(`period_type must be one of ${PERIOD_TYPES.join(", ")} (got "${periodType}").`);
  }

  const periodLabel = text("period_label", 40);
  if (!periodLabel) errors.push("Missing required statement field: period_label");

  const periodEnd = text("period_end_date", 10);
  if (!periodEnd) errors.push("Missing required statement field: period_end_date");
  else if (!isRealDate(periodEnd)) errors.push(`period_end_date must be a real date as YYYY-MM-DD (got "${periodEnd}").`);

  const basis = text("basis", 20);
  if (!basis) errors.push("Missing required statement field: basis");
  else if (!(BASES as readonly string[]).includes(basis)) {
    errors.push(`basis must be "standalone" or "consolidated" (got "${basis}").`);
  }

  const numbers = {} as Record<NumericField, number | null>;
  for (const key of ALL_FIELD_KEYS) {
    const v = input[key];
    if (v === undefined || v === null || v === "") {
      numbers[key] = null;
      continue;
    }
    // Numbers pass as they are; strings go through the same parser the forms use.
    const parsed = typeof v === "number" || typeof v === "string" ? parseNumberInput(v) : { value: null, invalid: true };
    if (parsed.invalid) errors.push(`${key} must be a number (got ${JSON.stringify(v)}).`);
    numbers[key] = parsed.value;
  }
  for (const key of REQUIRED_FIELD_KEYS) {
    if (numbers[key] == null && !errors.some((e) => e.startsWith(key))) {
      errors.push(`Missing required statement field: ${key}`);
    }
  }

  const sourceFile = text("source_file", 200) ?? "manual-entry";
  const sourcePage = text("source_page", 50);
  const notes = text("extraction_notes", 4000);

  if (errors.length > 0) return { row: null, errors };
  return {
    row: {
      period_type: periodType as PeriodType,
      period_label: periodLabel as string,
      period_end_date: periodEnd as string,
      basis: basis as Basis,
      source_file: sourceFile,
      source_page: sourcePage,
      extraction_notes: notes,
      ...numbers,
    },
    errors: [],
  };
}

const money = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export function validateStatement(row: StatementRow, others: OtherStatement[]): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const issues: Issue[] = [];
  const error = (message: string, fields: NumericField[]) => {
    errors.push(message);
    issues.push({ severity: "error", message, fields });
  };
  const warn = (message: string, fields: NumericField[]) => {
    warnings.push(message);
    issues.push({ severity: "warning", message, fields });
  };
  const n = (k: NumericField) => row[k];

  // The balance sheet must balance: assets = liabilities + equity, to 1% for rounding.
  const { total_assets: ta, total_liabilities: tl, total_equity: te } = row;
  if (ta != null && tl != null && te != null) {
    const implied = tl + te;
    const diff = Math.abs(ta - implied);
    if (diff > Math.max(Math.abs(ta) * 0.01, 1)) {
      error(
        `Balance sheet does not balance: total assets ${money(ta)} vs total liabilities + total equity ${money(implied)} ` +
          `(difference ${money(diff)}). Total liabilities here means liabilities excluding equity.`,
        ["total_assets", "total_liabilities", "total_equity"]
      );
    }
  }

  // Never negative for a going concern. Equity is deliberately NOT here: negative net worth is
  // rare but real, and is a warning below rather than a refusal to save a true figure.
  const nonNegative: [NumericField, string][] = [
    ["revenue_from_operations", "Revenue from operations"],
    ["current_assets", "Current assets"],
    ["current_liabilities", "Current liabilities"],
    ["inventory", "Inventory"],
    ["trade_receivables", "Trade receivables"],
    ["trade_payables", "Trade payables"],
    ["total_debt", "Total debt"],
    ["total_assets", "Total assets"],
    ["total_liabilities", "Total liabilities"],
    ["fixed_assets", "Fixed assets"],
    ["cash_and_equivalents", "Cash & equivalents"],
  ];
  for (const [key, label] of nonNegative) {
    const v = n(key);
    if (v != null && v < 0) error(`${label} cannot be negative (got ${money(v)}).`, [key]);
  }
  if (te != null && te < 0) {
    warn(
      `Total equity is negative (${money(te)}) - liabilities exceed assets. If that is what the filing shows, ` +
        `it is saved as entered, and debt-to-equity will not be computed.`,
      ["total_equity"]
    );
  }

  // A part cannot exceed its whole.
  const parts: [NumericField, NumericField, string, string][] = [
    ["current_assets", "total_assets", "Current assets", "total assets"],
    ["fixed_assets", "total_assets", "Fixed assets", "total assets"],
    ["current_liabilities", "total_liabilities", "Current liabilities", "total liabilities"],
  ];
  for (const [part, whole, partLabel, wholeLabel] of parts) {
    const p = n(part);
    const w = n(whole);
    if (p != null && w != null && p > w) {
      error(`${partLabel} (${money(p)}) cannot exceed ${wholeLabel} (${money(w)}).`, [part, whole]);
    }
  }

  // Income-statement identities. Warnings only: definitions differ between companies (share of
  // associates, discontinued operations, minority interest), so a mismatch is a prompt to look,
  // not proof of a wrong figure.
  const rev = n("revenue_from_operations");
  if (rev != null && row.total_income != null && row.total_income < rev - 0.01) {
    warn(
      `Total income (${money(row.total_income)}) is less than revenue from operations (${money(rev)}) - ` +
        `total income should include revenue plus other income. Double-check these two figures.`,
      ["total_income", "revenue_from_operations"]
    );
  }
  if (rev != null && row.other_income != null && row.total_income != null) {
    const expected = rev + row.other_income;
    if (Math.abs(row.total_income - expected) > Math.max(Math.abs(expected) * 0.02, 1)) {
      warn(
        `Total income (${money(row.total_income)}) differs from revenue + other income (${money(expected)}).`,
        ["total_income", "revenue_from_operations", "other_income"]
      );
    }
  }
  // profit_before_tax and profit_after_tax are required at save time, but a draft mid-read (autofill,
  // an AI extraction) can legitimately be missing either one - checkDraft's own contract is "required
  // fields may be missing; skip nulls" (see extraction.ts), so these never assume either is present.
  if (row.tax_expense != null && row.profit_before_tax != null && row.profit_after_tax != null) {
    const expected = row.profit_before_tax - row.tax_expense;
    if (Math.abs(row.profit_after_tax - expected) > Math.max(Math.abs(expected) * 0.02, 1)) {
      warn(
        `Profit after tax (${money(row.profit_after_tax)}) differs from profit before tax - tax (${money(expected)}). ` +
          `This can be right if there are discontinued operations, associates or minority interest.`,
        ["profit_after_tax", "profit_before_tax", "tax_expense"]
      );
    }
  }
  if (row.total_income != null && row.total_expenses != null && row.profit_before_tax != null) {
    const expected = row.total_income - row.total_expenses - (row.exceptional_items ?? 0);
    if (Math.abs(row.profit_before_tax - expected) > Math.max(Math.abs(row.total_income) * 0.02, 1)) {
      warn(
        `Profit before tax (${money(row.profit_before_tax)}) differs from total income - total expenses - exceptional ` +
          `items (${money(expected)}). Check the sign of exceptional items (loss positive, gain negative).`,
        ["profit_before_tax", "total_income", "total_expenses", "exceptional_items"]
      );
    }
  }
  if (rev != null && row.ebitda != null && rev > 0 && row.ebitda > rev) {
    warn(`EBITDA (${money(row.ebitda)}) is larger than revenue from operations (${money(rev)}).`, ["ebitda", "revenue_from_operations"]);
  }

  // Unit heuristic: against the latest OTHER statement of the same kind, a >20x jump or drop is
  // far more often lakh-vs-crore than a real swing. Same period type and basis only - a quarter
  // is never expected to look like a year.
  const comparable = others
    .filter(
      (o) =>
        o.revenue_from_operations != null &&
        o.revenue_from_operations > 0 &&
        (o.period_type == null || o.period_type === row.period_type) &&
        (o.basis == null || o.basis === row.basis)
    )
    .sort((a, b) => b.period_end_date.localeCompare(a.period_end_date));
  const latest = comparable[0];
  if (latest && rev != null && rev > 0) {
    const ratio = rev / latest.revenue_from_operations!;
    if (ratio > 20 || ratio < 0.05) {
      const direction = ratio > 1 ? `${ratio.toFixed(1)}x higher` : `${(1 / ratio).toFixed(1)}x lower`;
      warn(
        `Revenue from operations (${money(rev)}) is ${direction} than ${latest.period_label} on file ` +
          `(${money(latest.revenue_from_operations!)}). That is more often a units mismatch (lakh vs crore) than a real swing.`,
        ["revenue_from_operations"]
      );
    }
  }

  const dupe = others.find(
    (o) =>
      o.period_end_date === row.period_end_date &&
      o.period_label !== row.period_label &&
      (o.period_type == null || o.period_type === row.period_type) &&
      (o.basis == null || o.basis === row.basis)
  );
  if (dupe) {
    warn(
      `Another ${row.basis} statement already ends on ${row.period_end_date} under a different label ` +
        `("${dupe.period_label}" vs "${row.period_label}"). Check this is not a duplicate.`,
      []
    );
  }

  return { errors, warnings, issues };
}

// ---------------------------------------------------------------------------------------------
// From a browser form to a validated row, the same way the server route does it.
// ---------------------------------------------------------------------------------------------

export type FormInput = {
  periodType: string;
  periodLabel: string;
  periodEndDate: string;
  basis: string;
  values: Record<string, string>;
  sourceFile: string;
  extractionNotes: string | null;
};

export type Prepared = {
  row: StatementRow | null;
  errors: string[];
  warnings: string[];
  issues: Issue[];
};

/** Form text -> checked row. Text that is not a number, a missing period, an unbalanced balance sheet
 * and the rest all come back as errors; unusual-but-possible things come back as warnings. */
export function prepareFromForm(form: FormInput, others: OtherStatement[]): Prepared {
  const { numbers, invalid } = parseFormValues(form.values);
  if (invalid.length > 0) {
    return {
      row: null,
      errors: invalid.map((label) => `${label} is not a number.`),
      warnings: [],
      issues: [],
    };
  }
  const { row, errors } = coerceStatement({
    period_type: form.periodType,
    period_label: form.periodLabel,
    period_end_date: form.periodEndDate,
    basis: form.basis,
    source_file: form.sourceFile,
    extraction_notes: form.extractionNotes,
    ...numbers,
  });
  if (!row) {
    // The server's wording ("Missing required statement field: period_label") is for API callers;
    // on a form say it in the form's words.
    const friendly = errors.map((e) =>
      e
        .replace("Missing required statement field: period_label", "Period label is required.")
        .replace("Missing required statement field: period_end_date", "Period end date is required.")
        .replace("Missing required statement field: revenue_from_operations", "Revenue from operations is required.")
        .replace("Missing required statement field: profit_before_tax", "Profit before tax is required.")
        .replace("Missing required statement field: profit_after_tax", "Profit after tax is required.")
    );
    return { row: null, errors: friendly, warnings: [], issues: [] };
  }
  const v = validateStatement(row, others);
  return { row: v.errors.length > 0 ? null : row, errors: v.errors, warnings: v.warnings, issues: v.issues };
}
