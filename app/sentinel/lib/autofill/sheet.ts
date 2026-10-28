// Sentinel autofill - CSV and Excel. A CA's or analyst's sheet comes in two shapes:
//
//   A  line items down the first column, one column per period (the usual "statement" sheet, or a multi-year
//      model): label | FY26 | FY25 | FY24
//   B  one row per period, one column per field: period | revenue | ebitda | pat ...
//
// Either way every period in the file becomes a candidate statement, so a five-year sheet is five statements
// in one go. Labels are matched with the same rules the PDF reader uses; units come from the sheet's own
// wording ("(Rs. in lakhs)"); anything it cannot place is left blank and named, never guessed.

import { parseNumberInput } from "../fields";
import { detectUnitInText, normaliseUnit, type CurrencyUnit } from "../units";
import { checkAndDowngrade, deriveFields, type Raw } from "./derive";
import { matchFieldHeader, matchLabel, statementOfHeading, type StatementKind, type Target } from "./labels";
import { findDates, parsePeriodHeader, periodForEndDate, type ParsedPeriodHeader } from "./periods";
import { findTrialBalanceLayout, readTrialBalance, trialBalanceRows } from "./trialBalance";
import { AutofillError, type AutofillOptions, type AutofillPeriod, type AutofillResult, type Confidence } from "./types";
import type { Basis } from "../types";

// ---------------------------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------------------------

/** Parse CSV text: quoted cells, doubled quotes, commas inside quotes, CRLF, a byte-order mark, and a comma,
 * semicolon, tab or pipe separator (whichever the file actually uses). */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 12);
  let best = ",", bestScore = -1;
  for (const d of [",", ";", "\t", "|"]) {
    const counts = lines.map((l) => {
      let n = 0, q = false;
      for (const ch of l) { if (ch === '"') q = !q; else if (!q && ch === d) n++; }
      return n;
    });
    const nonzero = counts.filter((c) => c > 0);
    if (nonzero.length === 0) continue;
    const mode = [...new Set(nonzero)].sort((a, b) => nonzero.filter((x) => x === b).length - nonzero.filter((x) => x === a).length)[0];
    const score = nonzero.filter((c) => c === mode).length * 10 + mode;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// The sheet
// ---------------------------------------------------------------------------------------------

type Cell = string;

const hasLetters = (s: string) => /[a-z]/i.test(s);

function tidy(rows: Cell[][]): Cell[][] {
  const trimmed = rows.map((r) => r.map((c) => (c ?? "").toString().replace(/\s+/g, " ").trim()));
  const nonEmpty = trimmed.filter((r) => r.some((c) => c !== ""));
  const width = Math.max(0, ...nonEmpty.map((r) => { let w = r.length; while (w > 0 && r[w - 1] === "") w--; return w; }));
  return nonEmpty.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
}

type PeriodSlot = {
  key: string;
  header: ParsedPeriodHeader;
  raw: Map<Target, { weight: number; sum: boolean; label: string; row: number; text: string; value: number }[]>;
};

const source = (row: number, label: string, text: string) => `row ${row} | ${label} | ${text}`;

/** The unit named in a "unit" / "reporting unit" column, read from the first data row that fills it. Null when there is no such column;
 * a value that is not a unit adds a note and is ignored, so a typo never decides the scale of a statement. */
function unitFromColumn(rows: string[][], notes: string[]): { unit: CurrencyUnit; evidence: string; ambiguous: boolean } | null {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const col = rows[i].findIndex((c) => /^(reporting[\s_-]*|currency[\s_-]*)?unit$/i.test(c.trim()));
    if (col < 0) continue;
    for (const r of rows.slice(i + 1)) {
      const v = (r[col] ?? "").trim();
      if (!v) continue;
      const unit = normaliseUnit(v);
      if (unit) return { unit, evidence: `the file's unit column says "${v}"`, ambiguous: false };
      notes.push(`The unit column says "${v}", which is not a unit Sentinel knows (crore, lakh, million, thousand, billion); the unit was not read from it.`);
      return null;
    }
  }
  return null;
}

export function autofillFromSheet(input: Cell[][], opts: AutofillOptions & { kind: "csv" | "xlsx" }): AutofillResult {
  const fyStart = opts.fyStartMonth ?? 4;
  const rows = tidy(input);
  if (rows.length < 2 || (rows[0]?.length ?? 0) < 2) {
    throw new AutofillError("The file has no table in it: it needs at least a row of headings and one row of figures.");
  }
  const notes: string[] = [];

  // A trial balance (ledger + debit/credit) is not a statement at all: read it into statement figures.
  const tbLayout = findTrialBalanceLayout(rows);
  if (tbLayout) return readAsTrialBalance(rows, tbLayout, fyStart, opts, notes);

  // A "unit" column ("crore", "million", "INR_MILLION") states the unit outright. A table with one row per period has nowhere else to say
  // it, and without it the figures were silently taken to be in the project's own unit (a million-rupee file read as crore is 10x out).
  const columnUnit = unitFromColumn(rows, notes);
  const unit = columnUnit ?? detectUnitInText(rows.slice(0, 40).map((r) => r.join(" ")).join("\n"));
  const topText = rows.slice(0, 8).map((r) => r.join(" ")).join(" ").toLowerCase();
  const sheetBasis: Basis | null = /consolidated/.test(topText) ? "consolidated" : /standalone|stand-alone/.test(topText) ? "standalone" : null;

  // Which shape is it?
  const labelHits = rows.filter((r) => { const l = firstLabel(r); return l ? matchLabel(l, null) : false; }).length;
  let fieldHeaderRow = -1, fieldHeaderHits = 0;
  rows.slice(0, 12).forEach((r, i) => {
    const hits = r.filter((c) => c && matchFieldHeader(c)).length;
    if (hits > fieldHeaderHits) { fieldHeaderHits = hits; fieldHeaderRow = i; }
  });

  let periods: AutofillPeriod[];
  let layout: string;
  if (fieldHeaderHits >= 3 && fieldHeaderHits > labelHits) {
    layout = "one row per period, one column per field";
    periods = readRowsAsPeriods(rows, fieldHeaderRow, fyStart, sheetBasis, opts, notes);
  } else if (labelHits >= 3) {
    layout = "line items down, periods across";
    periods = readColumnsAsPeriods(rows, fyStart, sheetBasis, opts, notes);
  } else {
    throw new AutofillError(
      "Could not recognise this sheet. Sentinel reads either a statement with line items down the first column and one column per period, " +
        "or a table with one row per period and a column for each line item (Revenue, EBITDA, PAT...)."
    );
  }
  if (periods.every((p) => Object.keys(p.fields).length === 0)) {
    throw new AutofillError("The sheet was read but no line items could be matched. Check the labels (Revenue, Profit before tax, Total assets...).");
  }
  periods.sort((a, b) => (b.period_end_date ?? "").localeCompare(a.period_end_date ?? ""));

  return {
    kind: opts.kind,
    unit: unit ? { unit: unit.unit, source: "sheet", evidence: unit.evidence, ambiguous: unit.ambiguous } : { unit: null, source: "none", evidence: null, ambiguous: false },
    periods,
    notes,
    pages_used: [],
    layout,
    source_file: opts.sourceFile ?? (opts.kind === "csv" ? "uploaded.csv" : "uploaded.xlsx"),
    key_audit_matters_text: null,
  };
}

/** The label of a row: its first cell with letters in it (a serial-number column may come first). */
function firstLabel(row: Cell[]): string | null {
  for (let i = 0; i < Math.min(row.length, 3); i++) if (row[i] && hasLetters(row[i])) return row[i];
  return null;
}

// ---- shape A -------------------------------------------------------------------------------------

function readColumnsAsPeriods(rows: Cell[][], fyStart: number, sheetBasis: Basis | null, opts: AutofillOptions, notes: string[]): AutofillPeriod[] {
  // The header row is the first row (before the first matched line item) with period-like cells.
  let headerRow = -1;
  let headers: ParsedPeriodHeader[] = [];
  for (let i = 0; i < rows.length; i++) {
    const lbl = firstLabel(rows[i]);
    if (lbl && matchLabel(lbl, null)) break;
    const parsed = rows[i].map((c, ci) => (ci === 0 || !c ? null : parsePeriodHeader(c, fyStart)));
    const hits = parsed.filter((p) => p && (p.period_label || p.unsupported)).length;
    if (hits >= 1) { headerRow = i; headers = parsed.map((p) => p ?? { ...EMPTY_HEADER }); break; }
  }
  const width = rows[0].length;
  if (headerRow === -1) {
    // No period headings: one anonymous column of figures if there is exactly one.
    headers = Array.from({ length: width }, () => ({ ...EMPTY_HEADER }));
    notes.push("No period headings were found; set the period label and end date yourself.");
  }

  const slots: PeriodSlot[] = [];
  const colSlot = new Map<number, PeriodSlot>();
  for (let c = 1; c < width; c++) {
    const h = headers[c];
    if (!h) continue;
    if (h.unsupported) {
      notes.push(`Skipped column "${h.unsupported}": Sentinel stores full years and single quarters only.`);
      continue;
    }
    if (headerRow !== -1 && !h.period_label) continue; // not a period column (e.g. "Notes", "Remarks")
    const slot: PeriodSlot = { key: h.period_end_date ?? `col${c}`, header: h, raw: new Map() };
    slots.push(slot);
    colSlot.set(c, slot);
  }
  if (slots.length === 0) throw new AutofillError("No period columns were found (looking for headings like FY26, 2025-26, Mar-26 or Q3 FY26).");

  let statement: StatementKind | null = null;
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    const label = firstLabel(row);
    if (!label) continue;
    const labelCol = row.indexOf(label);
    const numeric = row.slice(labelCol + 1).some((c) => c && !parseNumberInput(c).invalid && parseNumberInput(c).value != null);
    const heading = statementOfHeading(label);
    if (heading && !numeric) { statement = heading; continue; }
    const m = matchLabel(label, statement);
    if (!m) continue;
    for (const [c, slot] of colSlot) {
      const cell = row[c];
      if (!cell) continue;
      const p = parseNumberInput(cell);
      if (p.invalid || p.value == null) continue;
      const list = slot.raw.get(m.target) ?? [];
      list.push({ weight: m.weight, sum: m.sum, label, row: r + 1, text: cell, value: p.value });
      slot.raw.set(m.target, list);
    }
  }
  return slots.map((s) => finishSlot(s, sheetBasis, opts, fyStart));
}

const EMPTY_HEADER: ParsedPeriodHeader = { period_type: null, period_label: null, period_end_date: null, basis: null, unsupported: null, assumption: null };

function finishSlot(slot: PeriodSlot, sheetBasis: Basis | null, opts: AutofillOptions, _fyStart: number): AutofillPeriod {
  const raw: Raw = {};
  for (const [target, hits] of slot.raw) {
    if (hits[0].sum) {
      raw[target] = { value: Math.round(hits.reduce((n, h) => n + h.value, 0) * 100) / 100, source: hits.map((h) => source(h.row, h.label, h.text)).join(" ; "), confidence: "low" };
    } else {
      const best = hits.reduce((b, h) => (h.weight > b.weight ? h : b), hits[0]);
      const confidence: Confidence = best.weight >= 4 ? "high" : best.weight === 3 ? "medium" : "low";
      raw[target] = { value: best.value, source: source(best.row, best.label, best.text), confidence };
    }
  }
  const { fields, notes } = deriveFields(raw);
  const issues = checkAndDowngrade(fields);
  const pnotes = [...notes];
  if (slot.header.assumption) pnotes.push(slot.header.assumption);
  if (!slot.header.period_end_date) pnotes.push("The period's date could not be read; set the period label and end date yourself.");
  return {
    key: slot.key,
    period_type: slot.header.period_type,
    period_label: slot.header.period_label,
    period_end_date: slot.header.period_end_date,
    basis: slot.header.basis ?? sheetBasis ?? opts.preferredBasis ?? null,
    fields,
    notes: pnotes,
    issues,
  };
}

// ---- shape B -------------------------------------------------------------------------------------

function readRowsAsPeriods(rows: Cell[][], headerRow: number, fyStart: number, sheetBasis: Basis | null, opts: AutofillOptions, notes: string[]): AutofillPeriod[] {
  const header = rows[headerRow];
  const fieldCols = new Map<number, string>();
  header.forEach((h, c) => { const f = h ? matchFieldHeader(h) : null; if (f) fieldCols.set(c, f); });
  const find = (re: RegExp) => header.findIndex((h) => re.test(h.toLowerCase()));
  const periodCol = (() => {
    const i = find(/^(period|period label|fy|year|fiscal year|financial year|date|period end|period end date)$/);
    if (i >= 0) return i;
    return [...Array(header.length).keys()].find((c) => !fieldCols.has(c)) ?? 0;
  })();
  const endCol = find(/^period[_ ]end([_ ]date)?$/);
  const typeCol = find(/^period[_ ]type$/);
  const basisCol = find(/^basis$/);

  const out: AutofillPeriod[] = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    const periodText = row[periodCol];
    if (!periodText && !row.some((c, i) => fieldCols.has(i) && c)) continue;
    let parsed = parsePeriodHeader(periodText ?? "", fyStart);
    if (endCol >= 0 && row[endCol]) {
      const e = parsePeriodHeader(row[endCol], fyStart);
      if (e.period_end_date) parsed = { ...parsed, period_end_date: e.period_end_date, period_label: parsed.period_label ?? e.period_label, period_type: parsed.period_type ?? e.period_type };
    }
    if (typeCol >= 0 && /^(fy|q[1-4])$/i.test(row[typeCol] ?? "")) parsed = { ...parsed, period_type: row[typeCol].toUpperCase() as ParsedPeriodHeader["period_type"] };
    if (parsed.unsupported) {
      notes.push(`Skipped row "${parsed.unsupported}": Sentinel stores full years and single quarters only.`);
      continue;
    }
    const slot: PeriodSlot = { key: parsed.period_end_date ?? `row${r + 1}`, header: parsed, raw: new Map() };
    for (const [c, field] of fieldCols) {
      const cell = row[c];
      if (!cell) continue;
      const p = parseNumberInput(cell);
      if (p.invalid || p.value == null) continue;
      slot.raw.set(field as Target, [{ weight: 5, sum: false, label: header[c], row: r + 1, text: cell, value: p.value }]);
    }
    const period = finishSlot(slot, sheetBasis, opts, fyStart);
    if (basisCol >= 0 && /^(standalone|consolidated)$/i.test(row[basisCol] ?? "")) period.basis = row[basisCol].toLowerCase() as Basis;
    out.push(period);
  }
  if (out.length === 0) throw new AutofillError("No rows of figures were found under the column headings.");
  return out;
}


// ---- trial balance ------------------------------------------------------------------------------

function readAsTrialBalance(rows: Cell[][], layout: NonNullable<ReturnType<typeof findTrialBalanceLayout>>, fyStart: number, opts: AutofillOptions & { kind: "csv" | "xlsx" }, notes: string[]): AutofillResult {
  const tb = readTrialBalance(trialBalanceRows(rows, layout));
  if (Object.keys(tb.fields).length === 0) {
    throw new AutofillError("This looks like a trial balance, but no ledger could be placed in a statement line. Check that it lists ledger names with debit and credit balances.");
  }
  // The period is not in the ledgers: take the "as on" date printed above the table, or the one the caller knows.
  const above = rows.slice(0, layout.headerRow).map((r) => r.join(" ")).join(" ");
  const iso = opts.periodEndDate ?? findDates(above).at(-1)?.iso ?? null;
  const derived = iso ? periodForEndDate(iso, opts.periodType && opts.periodType !== "FY" ? "quarter" : "year", fyStart) : null;
  const pnotes = [...tb.notes];
  if (!derived) pnotes.push("The trial balance's date could not be read; set the period label and end date yourself.");
  const unit = detectUnitInText(above);
  notes.push("Read as a trial balance (ledger, debit, credit).");
  const { fields } = deriveFields(tb.fields as Raw);
  const issues = checkAndDowngrade(fields);
  return {
    kind: opts.kind,
    unit: unit
      ? { unit: unit.unit, source: "sheet", evidence: unit.evidence, ambiguous: unit.ambiguous }
      : { unit: "INR", source: "sheet", evidence: "Trial balances are kept in plain rupees (assumed - say so if this one is in lakh or crore)", ambiguous: true },
    periods: [{
      key: iso ?? "tb",
      period_type: derived?.period_type ?? null,
      period_label: derived?.period_label ?? null,
      period_end_date: derived?.period_end_date ?? null,
      basis: opts.preferredBasis ?? null,
      fields,
      notes: pnotes,
      issues,
    }],
    notes,
    pages_used: [],
    layout: "trial balance",
    source_file: opts.sourceFile ?? (opts.kind === "csv" ? "uploaded.csv" : "uploaded.xlsx"),
    key_audit_matters_text: null,
  };
}
