// Sentinel autofill / notes - transactions with related parties. Ind AS 24 makes every company list what it did with its promoter group, subsidiaries, associates and
// key management: sales and purchases, loans and deposits placed, guarantees given, dividends paid. The forensic question is old and simple - is the company lending to,
// guaranteeing for, or selling mostly to, people it is tied to - and the answer is in this table, which nobody reads.
//
// The tables are matrices (a row per type of transaction, a column per type of party, a total at the end) and every report words and orders them differently, so this does
// not try to name the columns or read the whole note. It reads the rows it can verify: a row is accepted only when its party columns add up to its total. It tags the
// rows that matter (loans, deposits and advances given; guarantees given; revenue; purchases; dividends paid) and reports their totals with the page.
//
// What it does not do: say who the parties are or how the columns split (the table is on the page); read a note laid out as prose or as one table per party; or judge
// whether a transaction is at arm's length. Revenue and purchases are compared with the company's own revenue and expenses only when those are supplied.

import type { PdfPage } from "../../extraction";
import type { NoteFinding } from "./ageing";
import { parseRow } from "./numeric";

export type RptKind = "loan_given" | "guarantee_given" | "revenue" | "purchase" | "dividend_paid" | "investment" | "other";
export type RptRow = { label: string; kind: RptKind; /** Amount per party column, in print order. */ columns: number[]; total: number; text: string };
export type RptTable = { page: number; year_hint: number | null; unit: string | null; rows: RptRow[] };

const KIND: [RptKind, RegExp][] = [
  ["loan_given", /(?:loans?|advances?)(?: and (?:loans?|advances?))?\s+(?:given|granted|made|to related)|inter-?corporate deposits?\s+(?:placed|given|made)|loans? to\b|deposits? placed/i],
  ["guarantee_given", /guarantees?\s+(?:given|provided|issued)|corporate guarantee|letters? of comfort/i],
  ["revenue", /^(?:revenue from operations|sale of (?:goods|services|products)|income from services|revenue)\b/i],
  ["purchase", /^purchases? of (?:goods|services|materials|stock)|^purchases?\b|^services received/i],
  ["dividend_paid", /dividends? paid/i],
  ["investment", /^investments? in|^purchase of investments|^acquisition of/i],
];
const UNIT = /\b(crore|crores|lakh|lakhs|million|millions)\b/i;
const kindOf = (label: string): RptKind => KIND.find(([, re]) => re.test(label))?.[0] ?? "other";

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(2, Math.abs(b) * 0.002);

const SECTION = /^(?:For the )?(?:year ended|as at|as on)\s+(?:march 31,?|31 march,?)\s*(20\d\d)/i;
/** A page that introduces related-party transactions or balances, as opposed to one that merely mentions a subsidiary. */
const INTRODUCES = /(?:transactions?|disclosures?|balances?|dealings?)[^.\n]{0,50}related part|related part[^.\n]{0,50}(?:transactions?|disclosures?|balances?)/i;

function tablesOnPage(page: PdfPage): RptTable[] {
  if (!INTRODUCES.test(page.text)) return [];
  const sections: { year: number | null; rows: RptRow[] }[] = [{ year: null, rows: [] }];
  let pending: string[] = [];
  for (const line of page.text.split("\n")) {
    const sec = SECTION.exec(line.trim());
    if (sec) { sections.push({ year: Number(sec[1]), rows: [] }); pending = []; continue; }
    const row = parseRow(line);
    if (!row) { const t = line.trim(); if (t !== "" && !/^(?:Particulars|Total|Notes? forming|\(.{0,12}(?:crore|million|lakh)\))/i.test(t)) { pending.push(t); if (pending.length > 4) pending.shift(); } continue; }
    const cells = row.cells.map((c) => c.value);
    const label = (/^[a-z(]/.test(row.label) && pending.length ? `${pending.join(" ")} ${row.label}` : row.label || pending.join(" ")).replace(/\s+/g, " ").trim();
    pending = [];
    // Party columns and a total: at least two columns, the last the sum of the others. A single figure is a balance, not a row of this matrix.
    if (cells.length < 3 || label === "") continue;
    const total = cells[cells.length - 1];
    const columns = cells.slice(0, -1);
    if (!near(columns.reduce((a, b) => a + b, 0), total)) continue;
    sections[sections.length - 1].rows.push({ label: label.slice(0, 110), kind: kindOf(label), columns, total, text: row.text });
  }
  const unit = UNIT.exec(page.text.slice(0, 700))?.[1]?.toLowerCase().replace(/s$/, "") ?? null;
  // A related-party matrix has many transaction types; a handful of rows is some other table with a total column.
  return sections.filter((x) => x.rows.length >= 6).map((x) => ({ page: page.num, year_hint: x.year, unit, rows: x.rows }));
}

export function readRelatedParties(pages: PdfPage[]): RptTable[] {
  return pages.flatMap(tablesOnPage);
}

// ---- what they say ----------------------------------------------------------------------------------------------------------

/** Starting assumptions: exposure to related parties as a share of net worth, and related-party revenue or purchases as a share of the company's own. */
export const RPT_THRESHOLDS = { exposure_medium: 0.05, exposure_high: 0.15, concentration_medium: 0.25, concentration_high: 0.5 };

const fmt = (v: number, unit: string | null) => `${v.toLocaleString(unit === "million" ? "en-US" : "en-IN")}${unit ? ` ${unit}` : ""}`;
const sum = (rows: RptRow[]) => rows.reduce((n, r) => n + r.total, 0);

/** `context` is the company's own figures in the table's unit, when known: net worth for exposure, revenue and total expenses for concentration. */
export function relatedPartyFindings(tables: RptTable[], context: { net_worth?: number | null; revenue?: number | null; expenses?: number | null } = {}): NoteFinding[] {
  const out: NoteFinding[] = [];
  const latest = Math.max(0, ...tables.map((t) => t.year_hint ?? 0));
  const flow = tables.filter((t) => t.year_hint === latest && t.rows.some((r) => r.kind === "revenue" || r.kind === "purchase" || r.kind === "loan_given"));
  for (const t of flow) {
    const exposure = t.rows.filter((r) => r.kind === "loan_given" || r.kind === "guarantee_given");
    const given = sum(exposure);
    if (given > 0) {
      const share = context.net_worth && context.net_worth > 0 ? given / context.net_worth : null;
      out.push({
        id: "rpt_exposure", page: t.page,
        severity: share == null ? "info" : share >= RPT_THRESHOLDS.exposure_high ? "high" : share >= RPT_THRESHOLDS.exposure_medium ? "medium" : "info",
        title: `Loans, deposits and guarantees to related parties in the year: ${fmt(given, t.unit)}${share != null ? ` (${(share * 100).toFixed(1)}% of net worth)` : ""}`,
        detail: `${exposure.map((r) => `${r.label}: ${fmt(r.total, t.unit)}`).join("; ")}. These are the year's transactions; the balances outstanding are in the table that follows. Thresholds of ${RPT_THRESHOLDS.exposure_medium * 100}% and ${RPT_THRESHOLDS.exposure_high * 100}% of net worth are starting assumptions.`,
      });
    }
    for (const [kind, label, base] of [["revenue", "Revenue from related parties", context.revenue], ["purchase", "Purchases from related parties", context.expenses]] as const) {
      const rows = t.rows.filter((r) => r.kind === kind);
      const amount = rows.length ? rows[0].total : 0; // the first matching row: "Revenue from operations", not every later sub-line
      if (amount <= 0) continue;
      const share = base && base > 0 ? amount / base : null;
      if (share != null && share < RPT_THRESHOLDS.concentration_medium) continue;
      if (share == null && kind === "purchase") continue; // without the company's own figure a purchases total says little
      out.push({
        id: `rpt_${kind}`, page: t.page,
        severity: share == null ? "info" : share >= RPT_THRESHOLDS.concentration_high ? "high" : "medium",
        title: `${label}: ${fmt(amount, t.unit)}${share != null ? ` (${(share * 100).toFixed(0)}% of the company's ${kind === "revenue" ? "revenue" : "expenses"})` : ""}`,
        detail: `${rows[0].text.slice(0, 200)}. Columns are the types of related party as printed on the page. Thresholds of ${RPT_THRESHOLDS.concentration_medium * 100}% and ${RPT_THRESHOLDS.concentration_high * 100}% are starting assumptions.`,
      });
    }
  }
  return out;
}
