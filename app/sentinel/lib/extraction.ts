// Sentinel - Document Intelligence helpers (pure, no network). The extraction route uses them to
//
//   1. find the pages of a filing that ARE the financial statements, instead of taking a window
//      starting at the first mention of "Balance Sheet" anywhere in the report (a table of contents
//      or an auditor's letter mentions it long before the statements do);
//   2. read the reporting unit from the statement pages themselves;
//   3. check every number the model returned against the text it was given - a figure the page
//      does not contain is flagged for the human, not trusted;
//   4. parse the model's reply defensively and run the same accounting checks the save path uses.
//
// The model only labels figures that are on the page. Everything it returns still lands in an
// editable form that a person reviews before anything is saved.

import { ALL_FIELD_KEYS, BASES, PERIOD_TYPES, parseNumberInput, type NumericField } from "./fields";
import { convertAmount, detectUnitInText, normaliseUnit, unitLabel, type CurrencyUnit, type UnitDetection } from "./units";
import { validateStatement, type Issue, type StatementRow } from "./validate";
import type { Basis, PeriodType } from "./types";

export type PdfPage = { num: number; text: string };

// ---------------------------------------------------------------------------------------------
// 1. Page selection
// ---------------------------------------------------------------------------------------------

// What a financial-statement page contains. Each distinct hit scores once.
const HEADINGS: [RegExp, number][] = [
  [/statements?\s+of\s+(?:consolidated\s+|standalone\s+)?profit\s*(?:and|&)\s*loss/i, 4],
  [/balance\s+sheet/i, 4],
  [/statements?\s+of\s+(?:consolidated\s+|standalone\s+)?financial\s+position/i, 4],
  [/cash\s+flows?\s+statement|statements?\s+of\s+cash\s+flows?/i, 3],
];
const LINE_ITEMS: RegExp[] = [
  /revenue\s+from\s+operations/i,
  /other\s+income/i,
  /total\s+income/i,
  /total\s+expenses/i,
  /finance\s+costs?/i,
  /depreciation\s+(?:and|&)\s+amorti[sz]ation/i,
  /profit\s*(?:\/\s*\(loss\)\s*)?before\s+(?:exceptional\s+items\s+(?:and|&)\s+)?tax/i,
  /tax\s+expenses?/i,
  /profit\s*(?:\/\s*\(loss\)\s*)?for\s+the\s+(?:year|period)/i,
  /total\s+assets/i,
  /current\s+assets/i,
  /current\s+liabilities/i,
  /trade\s+receivables/i,
  /inventories/i,
  /trade\s+payables/i,
  /borrowings/i,
  /total\s+equity/i,
  /net\s+cash\s+(?:generated\s+from|from|used\s+in|flows?)/i,
  /purchase\s+of\s+(?:property|fixed\s+assets|tangible)/i,
  /operating\s+activities/i,
  /investing\s+activities/i,
  /financing\s+activities/i,
];

const NUMBER_TOKEN = /\(?-?\d[\d,]*(?:\.\d+)?\)?/g;

export type PageAnalysis = {
  score: number;
  /** Distinct statement line items found on the page. */
  items: number;
  /** Rows that carry two or more figures - the signature of a table. */
  numericRows: number;
};

/** How much a page looks like a financial statement. A statement is a TABLE of line items, so the
 * score alone is not enough: a directors' letter that names both statements can reach it, which is
 * why selection also asks for several distinct line items and several rows of figures. Table-of-
 * contents pages (dot leaders) are penalised. */
export function analysePage(text: string): PageAnalysis {
  let score = 0;
  for (const [re, pts] of HEADINGS) if (re.test(text)) score += pts;
  let items = 0;
  for (const re of LINE_ITEMS) if (re.test(text)) items += 1;
  score += items;

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  let numericRows = 0;
  if (lines.length > 0) {
    numericRows = lines.filter((l) => (l.match(NUMBER_TOKEN) ?? []).filter((t) => /\d{2,}/.test(t)).length >= 2).length;
    score += Math.min(5, (numericRows / lines.length) * 10);
    const leaders = lines.filter((l) => /\.{4,}|\u2026{2,}/.test(l)).length;
    if (leaders >= 3) score -= 6;
  }
  return { score, items, numericRows };
}

export const scorePage = (text: string): number => analysePage(text).score;

const MIN_STATEMENT_SCORE = 9;
const MAX_STATEMENT_PAGES = 10;

function tagBasis(text: string): Basis | null {
  const head = text.slice(0, 900).toLowerCase();
  const c = head.indexOf("consolidated");
  const s = head.indexOf("standalone");
  if (c === -1 && s === -1) return null;
  if (c === -1) return "standalone";
  if (s === -1) return "consolidated";
  return c < s ? "consolidated" : "standalone";
}

export type PageSelection = {
  text: string;
  pages: number[];
  /** Basis of each chosen page where the page says; null where it does not. */
  basisByPage: Record<number, Basis | null>;
  unit: UnitDetection | null;
  notes: string[];
};

/** The statement pages of a filing, in page order, ready to hand to the model. Returns null when
 * no page looks like a financial statement (the caller then falls back to a text clip). */
export function selectStatementPages(
  pages: PdfPage[],
  opts: { maxChars?: number; preferredBasis?: Basis | null } = {}
): PageSelection | null {
  const maxChars = opts.maxChars ?? 150_000;
  const scored = pages.map((p) => ({ ...p, ...analysePage(p.text), basis: tagBasis(p.text) }));
  let chosen = scored.filter((p) => p.score >= MIN_STATEMENT_SCORE && p.items >= 3 && p.numericRows >= 4);
  if (chosen.length === 0) return null;

  // A statement often runs onto a second page with no heading; keep a following page that is
  // clearly more of the same table - but never a notes page, which repeats line items.
  const byNum = new Map(scored.map((p) => [p.num, p]));
  const isChosen = new Set(chosen.map((p) => p.num));
  const extra = new Set<number>();
  for (const p of chosen) {
    const next = byNum.get(p.num + 1);
    if (
      next &&
      !isChosen.has(next.num) &&
      next.score >= 5 &&
      next.items >= 3 &&
      next.numericRows >= 3 &&
      !/^\s*notes?\b/i.test(next.text)
    ) {
      extra.add(next.num);
    }
  }
  chosen = [...chosen, ...[...extra].map((n) => byNum.get(n)!)];

  const notes: string[] = [];
  // Annual reports carry both a standalone and a consolidated set. Keep the basis the company is
  // compared on, when the pages say which is which.
  if (opts.preferredBasis) {
    const wanted = chosen.filter((p) => p.basis === opts.preferredBasis);
    const other = chosen.filter((p) => p.basis != null && p.basis !== opts.preferredBasis);
    if (wanted.length > 0 && other.length > 0) {
      chosen = chosen.filter((p) => p.basis === opts.preferredBasis || p.basis == null);
      notes.push(`Pages for the other basis were left out; only ${opts.preferredBasis} pages were read.`);
    } else if (wanted.length === 0 && other.length > 0) {
      notes.push(
        `No ${opts.preferredBasis} statement pages were identified; the ${other[0].basis} pages were read instead - check the basis.`
      );
    }
  }

  // Highest-scoring pages first until the budget is spent, then back into page order.
  const ranked = [...chosen].sort((a, b) => b.score - a.score).slice(0, MAX_STATEMENT_PAGES);
  const kept: typeof ranked = [];
  let used = 0;
  for (const p of ranked) {
    if (used + p.text.length > maxChars && kept.length > 0) continue;
    kept.push(p);
    used += p.text.length;
  }
  kept.sort((a, b) => a.num - b.num);

  const text = kept.map((p) => `=== PAGE ${p.num} ===\n${p.text.trim()}`).join("\n\n");
  return {
    text,
    pages: kept.map((p) => p.num),
    basisByPage: Object.fromEntries(kept.map((p) => [p.num, p.basis])),
    unit: detectUnitInText(text),
    notes,
  };
}

// ---------------------------------------------------------------------------------------------
// 3. Grounding: is this number actually on the page?
// ---------------------------------------------------------------------------------------------

export function numbersInText(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(NUMBER_TOKEN)) {
    const parsed = parseNumberInput(m[0]);
    if (parsed.value == null) continue;
    out.add(Math.abs(parsed.value).toFixed(2));
  }
  return out;
}

/** Does `value` appear in the text, ignoring sign and thousands separators? */
export function valueAppearsInText(value: number, text: string | Set<string>): boolean {
  const set = typeof text === "string" ? numbersInText(text) : text;
  return set.has(Math.abs(value).toFixed(2));
}

// ---------------------------------------------------------------------------------------------
// 4. The model's reply
// ---------------------------------------------------------------------------------------------

export type ExtractionDraft = {
  period_type: PeriodType | null;
  period_label: string | null;
  period_end_date: string | null;
  basis: Basis | null;
  fields: Partial<Record<NumericField, number>>;
  extraction_notes: string | null;
  low_confidence_fields: NumericField[];
  /** What the model says the page states, as a cross-check on the text-based reading. */
  model_unit: CurrencyUnit | null;
};

const isRealDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** The first balanced-looking JSON object in the model's text, tolerating a code fence or a
 * stray sentence around it. */
export function extractJsonObject(raw: string): unknown {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object in the model reply.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export function parseModelDraft(raw: string): { draft: ExtractionDraft; problems: string[] } {
  const parsed = extractJsonObject(raw) as Record<string, unknown>;
  const problems: string[] = [];
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

  const periodType = str(parsed.period_type, 4);
  const basis = str(parsed.basis, 20);
  const endDate = str(parsed.period_end_date, 10);

  const fields: ExtractionDraft["fields"] = {};
  const given = parsed.fields && typeof parsed.fields === "object" ? (parsed.fields as Record<string, unknown>) : {};
  for (const key of ALL_FIELD_KEYS) {
    const v = given[key];
    if (v === null || v === undefined) continue;
    const p = typeof v === "number" || typeof v === "string" ? parseNumberInput(v) : { value: null, invalid: true };
    if (p.invalid || p.value == null) {
      problems.push(`${key}: the reply held ${JSON.stringify(v)}, which is not a number, so it was left blank.`);
      continue;
    }
    fields[key] = p.value;
  }
  const unknownKeys = Object.keys(given).filter((k) => !(ALL_FIELD_KEYS as string[]).includes(k));
  if (unknownKeys.length > 0) problems.push(`Ignored fields that are not part of the statement: ${unknownKeys.join(", ")}.`);

  const low = Array.isArray(parsed.low_confidence_fields)
    ? (parsed.low_confidence_fields.filter((k): k is NumericField => typeof k === "string" && (ALL_FIELD_KEYS as string[]).includes(k)))
    : [];

  return {
    draft: {
      period_type: periodType && (PERIOD_TYPES as readonly string[]).includes(periodType) ? (periodType as PeriodType) : null,
      period_label: str(parsed.period_label, 40),
      period_end_date: endDate && isRealDate(endDate) ? endDate : null,
      basis: basis && (BASES as readonly string[]).includes(basis) ? (basis as Basis) : null,
      fields,
      extraction_notes: str(parsed.extraction_notes, 2000),
      low_confidence_fields: low,
      model_unit: typeof parsed.unit === "string" ? normaliseUnit(parsed.unit) : null,
    },
    problems,
  };
}

/** Decide the unit. The statement pages' own wording wins; the model's reading is only a fallback
 * and is labelled as such. */
export function resolveUnit(
  detected: UnitDetection | null,
  modelUnit: CurrencyUnit | null
): { unit: CurrencyUnit | null; source: "page" | "model" | "none"; note: string | null } {
  if (detected) {
    const note = detected.ambiguous
      ? `The pages mention more than one unit (most often ${detected.evidence}); check the figures against the filing.`
      : modelUnit && modelUnit !== detected.unit
      ? `The pages say "${detected.evidence}" but the model read ${modelUnit}; the page wording was used.`
      : null;
    return { unit: detected.unit, source: "page", note };
  }
  if (modelUnit) {
    return { unit: modelUnit, source: "model", note: "No unit statement was found on the pages; the unit is the model's reading - check it." };
  }
  return { unit: null, source: "none", note: "No reporting unit was found in the filing; enter figures in the unit shown for this company." };
}

/** Fields the page does not contain verbatim. */
export function ungroundedFields(fields: ExtractionDraft["fields"], text: string): NumericField[] {
  const present = numbersInText(text);
  return (Object.keys(fields) as NumericField[]).filter((k) => !valueAppearsInText(fields[k] as number, present));
}

/** Run the save-time accounting checks over a draft so inconsistencies show up before the person
 * reviews it, with the fields involved. Period fields use placeholders; only the figures matter. */
export function checkDraft(fields: ExtractionDraft["fields"]): Issue[] {
  const row = {
    period_type: "FY", period_label: "draft", period_end_date: "2000-01-01", basis: "consolidated",
    source_file: "draft", source_page: null, extraction_notes: null,
  } as unknown as StatementRow;
  for (const key of ALL_FIELD_KEYS) (row as unknown as Record<string, unknown>)[key] = fields[key] ?? null;
  // Required fields may legitimately be missing from a draft; the checks skip nulls.
  return validateStatement(row, []).issues;
}

// ---------------------------------------------------------------------------------------------
// The prompt
// ---------------------------------------------------------------------------------------------

export const EXTRACTION_SYSTEM_PROMPT =
  "You extract financial statement figures from filing text into structured JSON. Rules:\n" +
  "1. Only report a number that appears in the text. Never estimate, infer or calculate one. If you cannot see it, its value is null.\n" +
  "2. Use the column for the MOST RECENT period only. Annual reports show the current year beside a prior-year comparative; quarterly results show several columns (the quarter, the previous quarter, the same quarter last year, the year to date, the full year). Take the single-quarter or full-year column that matches the period you report, never a comparative or cumulative one, and say which column you used in extraction_notes.\n" +
  "3. Report figures exactly as printed, in the document's own unit. Do not convert units. Put the unit the statement pages declare in \"unit\" (one of: crore, lakh, million, thousand, billion, rupees, unknown).\n" +
  "4. Sign conventions: revenue, income and expense lines are positive numbers as printed. profit_before_tax and profit_after_tax are negative for a loss. exceptional_items: a loss or expense is POSITIVE, a gain is NEGATIVE. Cash-flow lines keep the sign of the statement (outflows negative), except capex, which is a positive amount. A figure printed in brackets is negative.\n" +
  "5. The text may hold both standalone and consolidated statements. Use the basis stated in the request when it is present; otherwise use the statements you find and say which basis they are in. Never mix figures from the two. If you are unsure which you are reading, say so in extraction_notes.\n" +
  "6. total_debt is current plus non-current borrowings only if both are printed; if you would have to add them yourself, return null and explain in extraction_notes. The same applies to every total: do not add figures yourself.\n" +
  "7. period_label is short, like \"FY25\" or \"Q3 FY26\"; period_end_date is \"YYYY-MM-DD\" or null if unclear.\n" +
  "8. Respond with ONLY a JSON object - no preamble, no markdown fences.";

export function buildExtractionUserPrompt(opts: {
  fieldList: string[];
  preferredBasis: Basis | null;
  text: string;
}): string {
  return (
    `Extract these fields from the filing text below: ${opts.fieldList.join(", ")}.\n\n` +
    (opts.preferredBasis ? `The company is compared on a ${opts.preferredBasis} basis: use the ${opts.preferredBasis} statements.\n\n` : "") +
    `Also return period_type ("FY"|"Q1"|"Q2"|"Q3"|"Q4"), period_label, period_end_date, ` +
    `basis ("standalone"|"consolidated"), unit, extraction_notes (the column used, ambiguities, anything not found), ` +
    `and low_confidence_fields (array of field names you are unsure about).\n\n` +
    `JSON shape:\n{"period_type": ..., "period_label": ..., "period_end_date": ..., "basis": ..., "unit": ..., ` +
    `"fields": {"<field_name>": number|null, ...}, "extraction_notes": "...", "low_confidence_fields": ["..."]}\n\n` +
    `--- FILING TEXT ---\n${opts.text}`
  );
}

// ---------------------------------------------------------------------------------------------
// Uploaded-file safety
// ---------------------------------------------------------------------------------------------

export const BLOB_PATH_PREFIX = "sentinel-extract/";

/** A blob URL is only fetched if it is one of ours: https, on Vercel Blob's public host, under the
 * folder the upload route issues tokens for. Anything else (an internal address, a metadata
 * endpoint, someone else's file) is refused, since this server fetches the URL it is given. */
export function parseBlobUrl(raw: unknown): URL | null {
  if (typeof raw !== "string") return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  if (!u.hostname.endsWith(".public.blob.vercel-storage.com")) return null;
  if (!decodeURIComponent(u.pathname).startsWith(`/${BLOB_PATH_PREFIX}`)) return null;
  return u;
}

// ---------------------------------------------------------------------------------------------
// Applying a draft to a form
// ---------------------------------------------------------------------------------------------

export type ExtractionResult = {
  period_type: PeriodType | null;
  period_label: string | null;
  period_end_date: string | null;
  basis: Basis | null;
  fields: Partial<Record<NumericField, number>>;
  extraction_notes: string | null;
  low_confidence_fields: string[];
  unit: CurrencyUnit | null;
  unit_source: "page" | "model" | "none";
  checks: string[];
  pages_used: number[];
  source_file: string;
};

/** The draft's figures as form text, converted from the filing's unit to the company's reporting unit
 * (a lakh filing entered into a crore company would otherwise be 100x too large). The note says what
 * was done, or why nothing could be. */
export function applyExtractionResult(
  result: Pick<ExtractionResult, "fields" | "unit" | "unit_source">,
  workspaceUnit: string | null | undefined
): { values: Record<string, string>; unitNote: string | null } {
  const to = normaliseUnit(workspaceUnit) ?? "INR_CRORE";
  const from = result.unit;
  const values: Record<string, string> = {};
  let converted = false;
  for (const key of ALL_FIELD_KEYS) {
    const v = result.fields[key];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    if (from && from !== to) {
      values[key] = String(convertAmount(v, from, to));
      converted = true;
    } else {
      values[key] = String(v);
    }
  }
  const label = (u: CurrencyUnit) => unitLabel(u);
  let unitNote: string | null = null;
  if (!from) {
    unitNote = `The filing's unit could not be determined, so the figures are entered exactly as printed. This company reports in ${label(to)} - convert them first if the filing uses another unit.`;
  } else if (converted) {
    unitNote = `The filing is in ${label(from)}; the figures were converted to ${label(to)}, this company's reporting unit.${result.unit_source === "model" ? " (The filing's unit is the model's reading, not confirmed on the page.)" : ""}`;
  }
  return { values, unitNote };
}
