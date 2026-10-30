// Sentinel autofill / notes - contingent liabilities: what the company could owe if disputes go against it, none of which is on the balance sheet. The note is a
// table in some reports (HCLTech) and prose in others (TCS: "Contingent liability in respect of tax demands ... is Rs 506 crore and Rs 1,012 crore as at March 31, 2026
// and 2025"), so this reads both: a pair of amounts with the two years it names, and a small table with its printed total. Each carries its page and the words as printed.
//
// What it does not do: read the multi-page schedule of every tax matter some companies print, tell a trivial claim from an existential one, or judge probability
// (that is the management's and the auditor's call, and the auditor's report is read elsewhere). A year-on-year change and the size against net worth are given;
// what they mean is for the reader.

import type { PdfPage } from "../../extraction";
import type { NoteFinding } from "./ageing";
import { parseRow } from "./numeric";

export type ContingentItem = {
  /** The sentence or table row the amounts came from, as printed. */
  text: string;
  /** What the amount is about, when the sentence says ("tax demands"); otherwise null. */
  subject: string | null;
  current: number;
  prior: number | null;
  /** Years the sentence names for the two amounts, when it does. */
  years: [number, number] | null;
  unit: "crore" | "lakh" | "million" | null;
  kind: "sentence" | "table_total" | "table_row";
  page: number;
};

const MONEY = String.raw`(?:₹|Rs\.?|INR|H|\`|I)?\s?([\d]{1,3}(?:,\d{2,3})*(?:\.\d+)?)\s*(crore|crores|lakh|lakhs|million|millions)?`;
// "... is H506 crore and H1,012 crore as at March 31, 2026 and 2025, respectively"
const PAIR = new RegExp(`${MONEY}\\s*(?:and|,)\\s*${MONEY}\\s*(?:as at|as on|at)\\s*(?:March 31|31 March),?\\s*(20\\d\\d)\\s*and\\s*(?:(?:March 31|31 March),?\\s*)?(20\\d\\d)`, "i");
const UNIT = /\b(crore|lakh|million)s?\b/i;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const num = (s: string) => Number(s.replace(/,/g, ""));
const unitOf = (u: string | undefined, fallback: string | null): ContingentItem["unit"] => {
  const x = (u ?? fallback ?? "").toLowerCase().replace(/s$/, "");
  return x === "crore" || x === "lakh" || x === "million" ? x : null;
};

/** The sentences of a page's prose that speak of a contingent liability and give a pair of amounts for the two years. The phrase must sit just before the amounts
 * (the same sentence, not a heading that happens to precede a revenue paragraph), and a sentence about revenue, customers or segments is never one. */
function proseItems(page: PdfPage): ContingentItem[] {
  const out: ContingentItem[] = [];
  const flat = clean(page.text.replace(/\t/g, " "));
  const re = new RegExp(PAIR.source, "gi");
  for (let m = re.exec(flat); m; m = re.exec(flat)) {
    const sentenceStart = Math.max(flat.lastIndexOf(". ", m.index) + 2, m.index - 330);
    const lead = flat.slice(sentenceStart, m.index);
    if (!/contingent liabilit|tax contingenc|claims against|demands? (?:received|raised)/i.test(lead)) continue;
    if (/revenue|customers?|segment/i.test(lead)) continue;
    const sentence = flat.slice(sentenceStart, flat.indexOf(". ", m.index + m[0].length) + 1 || m.index + m[0].length + 80);
    const [, a, ua, b, ub, y1, y2] = m;
    const subject = /in respect of ([^.,]{3,70}?)(?:,| received| is | are | of )/i.exec(sentence)?.[1]?.trim() ?? null;
    out.push({ text: sentence.slice(0, 420), subject, current: num(a), prior: num(b), years: [Number(y1), Number(y2)], unit: unitOf(ua ?? ub, UNIT.exec(sentence)?.[1] ?? null), kind: "sentence", page: page.num });
  }
  return out;
}

const NOT_CONTINGENT = /commitment|capital account|contracts remaining|not provided for|net of advances|^particulars|^as at|^year ended/i;
const looksLikeYears = (a: number, b: number) => a >= 1990 && a <= 2100 && b >= 1990 && b <= 2100;

/** A note laid out as a table under a "Contingent liabilities" heading: rows of two figures (this year, last). Capital commitments that share the heading are left
 * out, and the total is the sum of the contingent rows kept (a printed total that also counts commitments would overstate them). */
function tableItems(page: PdfPage): ContingentItem[] {
  const lines = page.text.split("\n");
  const start = lines.findIndex((l) => /(?:^|\s)contingent liabilit/i.test(l.split("\t").slice(0, 2).join(" ")) && !/\d{3,}/.test(l) && l.length < 120);
  if (start < 0) return [];
  const rows: { label: string; a: number; b: number; text: string }[] = [];
  let pending = "";
  for (let i = start + 1; i < Math.min(lines.length, start + 40); i++) {
    const line = lines[i];
    if (/^\s*(?:Notes?\s*:?\s*$|\(?[a-z]\)\s)/i.test(line) && rows.length > 0) break;
    const row = parseRow(line);
    if (!row) { if (line.trim() !== "") pending = line.trim(); continue; }
    if (row.cells.length !== 2) { pending = ""; continue; }
    const [a, b] = row.cells.map((c) => c.value);
    const label = (/^[a-z(]/.test(row.label) && pending ? `${pending} ${row.label}` : row.label || pending).replace(/\s+/g, " ").trim();
    pending = "";
    if (label === "" || looksLikeYears(a, b) || NOT_CONTINGENT.test(label)) continue;
    if (a === 0 && b === 0) continue;
    rows.push({ label, a, b, text: row.text });
  }
  const unit = unitOf(undefined, UNIT.exec(page.text)?.[1] ?? null);
  const out: ContingentItem[] = rows.map((r) => ({ text: `${r.label} ${r.a.toLocaleString("en-IN")} ${r.b.toLocaleString("en-IN")}`, subject: r.label.slice(0, 80), current: r.a, prior: r.b, years: null, unit, kind: "table_row" as const, page: page.num }));
  if (rows.length >= 2) {
    const a = rows.reduce((n, r) => n + r.a, 0), b = rows.reduce((n, r) => n + r.b, 0);
    out.push({ text: `Sum of the ${rows.length} rows above`, subject: "Total", current: a, prior: b, years: null, unit, kind: "table_total", page: page.num });
  }
  return out;
}

export function readContingentLiabilities(pages: PdfPage[]): ContingentItem[] {
  const out: ContingentItem[] = [];
  for (const p of pages) {
    if (!/contingent liabilit|contingencies/i.test(p.text)) continue;
    out.push(...proseItems(p), ...tableItems(p));
  }
  return out;
}

// ---- what they say ----------------------------------------------------------------------------------------------------------

/** Starting assumptions, not calibrated: the share of net worth a stated contingent liability would be. */
export const CONTINGENT_THRESHOLDS = { medium: 0.1, high: 0.25 };
export const CONTINGENT_IMPLAUSIBLE = 3;

const fmt = (v: number, unit: string | null) => `${v.toLocaleString(unit === "million" ? "en-US" : "en-IN")}${unit ? ` ${unit}` : ""}`;

/** `netWorth` is total equity in the same unit as the amounts, when known; without it every stated amount is information, not a ranked finding. */
export function contingentFindings(items: ContingentItem[], netWorth?: number | null): NoteFinding[] {
  const out: NoteFinding[] = [];
  const stated = items.filter((i) => i.kind !== "table_row");
  const seen = new Set<string>();
  for (const i of stated) {
    const key = `${i.subject}|${i.current}|${i.prior}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // A contingent liability several times the company's net worth is possible but, far more often, a misread net worth: it is shown unranked rather than as an alarm.
    const raw = netWorth != null && netWorth > 0 ? i.current / netWorth : null;
    const share = raw != null && raw <= CONTINGENT_IMPLAUSIBLE ? raw : null;
    const severity: NoteFinding["severity"] = share == null ? "info" : share >= CONTINGENT_THRESHOLDS.high ? "high" : share >= CONTINGENT_THRESHOLDS.medium ? "medium" : "info";
    const change = i.prior != null && i.prior > 0 ? ` (${fmt(i.prior, i.unit)} the year before, ${i.current >= i.prior ? "+" : ""}${(((i.current - i.prior) / i.prior) * 100).toFixed(0)}%)` : "";
    out.push({
      id: "contingent", severity, page: i.page,
      title: `Contingent liability${i.subject && i.subject !== "Total" ? ` - ${i.subject}` : i.subject === "Total" ? " - total" : ""}: ${fmt(i.current, i.unit)}${change}`,
      detail: `${share != null ? `${(share * 100).toFixed(1)}% of net worth. ` : ""}Not on the balance sheet. As printed: "${i.text.slice(0, 260)}"`,
    });
  }
  return out;
}
