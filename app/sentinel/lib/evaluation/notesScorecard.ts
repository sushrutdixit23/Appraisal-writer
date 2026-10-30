// Sentinel evaluation - the accuracy scorecard for what is read out of an annual report. It exists so that someone who is not the author can repeat the check and
// see the same numbers. It never grades the reader against the reader's own opinion; it uses three kinds of evidence that do not depend on trusting it:
//
//   1. Tie-outs: a number the reader extracted must agree with another number printed in the same filing (receivables gross less allowance equals the net figure
//      the table prints a few lines on). Arithmetic the company already did, checked again.
//   2. Ground truth: statement figures compared with a file of figures a person typed from the filing (the CSVs in tests/sentinel/fixtures), with a tolerance, and
//      with missing and wrong counted separately - a missing figure is a gap, a wrong one is a danger.
//   3. A sheet for an outside checker: every extracted item with its page and the text it came from, and an empty verdict column, so precision can be measured by a
//      person looking at the PDF, not by us.
//
// What it says about itself: the tie-outs and the ground truth are small samples, and the author chose which filings are in them. The sheet is the real test.

import type { PdfPage } from "../extraction";
import type { AgeingTable } from "../autofill/notes/ageing";
import { parseRow } from "../autofill/notes/numeric";
import { wilson } from "./scoring";

export type TieOut = { page: number; status: "tied" | "no_match" | "not_testable"; detail: string };

/** Receivables gross less allowance should equal a net figure the filing prints near the table. Looks for that figure on the same page (a figure that is not there is a
 * "no match", which is not proof of an error: some reports print the net on another page, or split it into billed and unbilled). */
export function tieOutAgeing(t: AgeingTable, page: PdfPage | undefined): TieOut {
  const gross = t.total[t.total.length - 1];
  if (t.allowance == null || !page) return { page: t.page, status: "not_testable", detail: t.allowance == null ? "the table prints no allowance" : "page not found" };
  const target = gross - t.allowance;
  const seen = new Set<number>();
  for (const line of page.text.split("\n")) { const r = parseRow(line); if (r) for (const c of r.cells) seen.add(Math.abs(c.value)); }
  const hit = [...seen].find((v) => Math.abs(v - target) <= Math.max(1, target * 0.0005));
  return hit != null
    ? { page: t.page, status: "tied", detail: `gross ${gross.toLocaleString("en-IN")} less allowance ${t.allowance.toLocaleString("en-IN")} = ${target.toLocaleString("en-IN")}, printed on the page` }
    : { page: t.page, status: "no_match", detail: `gross ${gross.toLocaleString("en-IN")} less allowance ${t.allowance.toLocaleString("en-IN")} = ${target.toLocaleString("en-IN")} was not found among the figures on the page` };
}

// ---- statement figures against figures a person typed ------------------------------------------------------------------------

export type FieldComparison = { field: string; expected: number; got: number | null; status: "match" | "wrong" | "missing" };

/** Within half a unit or 0.05% of the typed figure: rounding in the filing, not a different line. */
export function compareFields(truth: Record<string, number>, got: Record<string, number | null | undefined>): FieldComparison[] {
  return Object.entries(truth).map(([field, expected]) => {
    const v = got[field];
    if (v == null) return { field, expected, got: null, status: "missing" as const };
    return { field, expected, got: v, status: Math.abs(v - expected) <= Math.max(0.5, Math.abs(expected) * 0.0005) ? ("match" as const) : ("wrong" as const) };
  });
}

export function summariseComparison(rows: FieldComparison[]) {
  const n = rows.length, match = rows.filter((r) => r.status === "match").length, wrong = rows.filter((r) => r.status === "wrong").length, missing = n - match - wrong;
  return { n, match, wrong, missing, interval: wilson(match, n) };
}

// ---- the sheet for an outside checker ----------------------------------------------------------------------------------------

export type SheetRow = { file: string; reader: string; page: number; what: string; values: string; source: string; /** Filled in by the checker; empty when the sheet is first written. */ verdict?: "right" | "wrong" | "partly"; notes?: string };
const esc = (s: string) => `"${s.replace(/"/g, '""').replace(/\s+/g, " ").trim()}"`;

/** One row per extracted item, with its page and the text it came from, and an empty verdict column. */
export function toCsv(rows: SheetRow[]): string {
  return ["file,reader,page,what,values,source_text,verdict (right / wrong / partly),checker_notes", ...rows.map((r) => [r.file, r.reader, r.page, esc(r.what), esc(r.values), esc(r.source), r.verdict ?? "", esc(r.notes ?? "")].join(","))].join("\n");
}

/** Reads a marked sheet back and gives precision per reader: right, wrong and partly, so the outside check produces the headline number. */
export function precisionFromSheet(csv: string): Record<string, { right: number; wrong: number; partly: number; unmarked: number; precision: number | null; interval: [number, number] | null }> {
  const out: Record<string, { right: number; wrong: number; partly: number; unmarked: number }> = {};
  const lines = csv.split(/\r?\n/).slice(1).filter((l) => l.trim() !== "");
  for (const l of lines) {
    const cells = parseCsvLine(l);
    const reader = cells[1], verdict = (cells[6] ?? "").trim().toLowerCase();
    const o = (out[reader] ??= { right: 0, wrong: 0, partly: 0, unmarked: 0 });
    if (verdict === "right") o.right++; else if (verdict === "wrong") o.wrong++; else if (verdict === "partly") o.partly++; else o.unmarked++;
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => { const marked = v.right + v.wrong + v.partly; return [k, { ...v, precision: marked ? v.right / marked : null, interval: marked ? wilson(v.right, marked) : null }]; }));
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur);
  return out;
}
