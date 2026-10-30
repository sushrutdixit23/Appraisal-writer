// Sentinel autofill / notes - the ratios a company must disclose about itself. Schedule III (Additional Regulatory Information) lists eleven (current ratio,
// debt-equity, debt service coverage, return on equity, inventory / receivables / payables turnover, net capital turnover, net profit, return on capital
// employed, return on investment) and SEBI's listing rules ask for a similar set with the reasons for any change of 25% or more. They are the company's own
// reading of itself, in its own words, with its own definition, printed next to last year's.
//
// What this does with them: reads each ratio row (the company's current figure, last year's, and the variance it prints), checks the variance against the two
// figures (a reading whose variance does not follow from its own figures is thrown out, so a mis-aligned column cannot get through), and reports where the
// company itself says a ratio moved by 25% or more. crossCheck() then sets the company's current ratio and net margin next to what Sentinel computes from the
// statements it read, so a mis-read statement or a differently defined ratio shows up as a disagreement worth a look.
//
// It does not read a row it cannot align: a table with four value columns (several bases side by side) is skipped, not guessed at.

import type { PdfPage } from "../../extraction";
import type { FinancialStatement } from "../../types";
import { parseToken } from "./numeric";
import type { NoteFinding } from "./ageing";

export const RATIO_NAMES = {
  current_ratio: /^current ratio/i,
  debt_equity: /^debt[\s–‐-]*equity/i,
  dscr: /^debt service coverage/i,
  interest_cover: /^interest (?:service )?coverage/i,
  roe: /^return on (?:equity|net ?worth)/i,
  roce: /^return on capital employed/i,
  roi: /^return on investment/i,
  inventory_turnover: /^inventory turnover/i,
  receivables_turnover: /^(?:trade )?(?:receivables?|debtors?)[\s-]*turnover/i,
  payables_turnover: /^trade payables? turnover/i,
  net_capital_turnover: /^net capital turnover/i,
  net_margin: /^net profit (?:ratio|margin)/i,
  operating_margin: /^operating profit (?:ratio|margin)/i,
} as const;
export type RatioId = keyof typeof RATIO_NAMES;

export type ReportedRatio = {
  id: RatioId;
  /** The ratio's name as printed, trimmed. */
  label: string;
  current: number;
  previous: number;
  /** The variance the company prints, as a percentage (-4.92 for "-4.92%"), when it prints one. */
  printed_variance: number | null;
  /** What the printed variance is: the relative change, or the difference in percentage points. Null when none is printed. */
  variance_kind: "relative" | "points" | null;
  /** The variance recomputed from the two figures, as a percentage. Null when last year is zero. */
  computed_variance: number | null;
  page: number;
  basis: "standalone" | "consolidated" | null;
  /** The row as printed, for the reader to check. */
  source: string;
};

const MIN_RATIOS_ON_PAGE = 3;
const pctChange = (cur: number, prev: number) => (prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100);

const UNIT_CELL = /^(?:%|times|x|in times|in %|nos\.?)$/i;

/** The figures a line ends with: its trailing tab cells that are wholly figures (a unit cell such as "%" or "Times" between the label and the figures is skipped).
 * A cell that is a footnote marker inside a label ("(times)(3)") is never wholly a figure, so it is never read as one. `glued` is a figure stuck to the end of the
 * text cell to their left ("Current assets Current liabilities 2.42"), which some PDFs print without a tab; it is only used if it makes the row verify. */
function trailingFigures(line: string): { figures: number[]; glued: number | null } {
  const cells = line.split("\t").map((c) => c.trim()).filter((c) => c !== "");
  const out: number[] = [];
  let i = cells.length - 1;
  for (; i >= 0; i--) {
    const t = cells[i];
    const tok = parseToken(t.replace(/\s+/g, ""));
    if (tok && /\d/.test(t)) out.unshift(tok.value);
    else if (UNIT_CELL.test(t)) continue;
    else break;
  }
  let glued: number | null = null;
  if (i >= 0) {
    const m = /\s(\(?-?\d[\d,]*\.?\d*\)?%?)$/.exec(cells[i]);
    const tok = m ? parseToken(m[1]) : null;
    if (tok) glued = tok.value;
  }
  return { figures: out, glued };
}

const basisOf = (text: string): ReportedRatio["basis"] => {
  const s = (text.match(/standalone/gi) ?? []).length, c = (text.match(/consolidated/gi) ?? []).length;
  return s > 0 && c === 0 ? "standalone" : c > 0 && s === 0 ? "consolidated" : null;
};

const firstCell = (line: string) => line.split("\t")[0].trim();

/** Which ratio a line opens, if any. A name that wraps ("Debt Service" / "Coverage Ratio") is matched on the line joined with the next. */
function nameAt(lines: string[], i: number): { id: RatioId; label: string } | null {
  const one = firstCell(lines[i]);
  const two = `${one} ${firstCell(lines[i + 1] ?? "")}`;
  for (const id of Object.keys(RATIO_NAMES) as RatioId[]) {
    if (RATIO_NAMES[id].test(one)) return { id, label: one };
    if (RATIO_NAMES[id].test(two)) return { id, label: two.trim() };
  }
  return null;
}

/** A printed variance follows from the two figures when it is their relative change (most companies) or, for a ratio already in percent, the difference in
 * percentage points (Wipro prints 19.08% against 17.93% as 1.15%). Null when it is neither. */
const kindOf = (printed: number, current: number, previous: number): "relative" | "points" | null => {
  const c = pctChange(current, previous);
  if (c != null && Math.abs(printed - c) <= Math.max(1.5, Math.abs(c) * 0.05)) return "relative";
  return Math.abs(printed - (current - previous)) <= 0.06 ? "points" : null;
};

type Aligned = { current: number; previous: number; printed: number | null; kind: "relative" | "points" | null };

/** Current, previous and (optionally) the printed variance from the figures a block ends in. Two figures: current and previous (nothing to verify them against).
 * Three: and the variance, which must follow from the first two. Four: a three-year table (current, last year, the year before, change), accepted only when the
 * change really is the one between the first two. A figure stuck to the label is tried in front of the others, and used only when that makes the variance verify. */
function align(f: number[], glued: number | null): Aligned | null {
  const attempt = (x: number[]): Aligned | null => {
    if (x.length === 3) { const k = kindOf(x[2], x[0], x[1]); if (k) return { current: x[0], previous: x[1], printed: x[2], kind: k }; }
    if (x.length === 4) { const k = kindOf(x[3], x[0], x[1]); if (k) return { current: x[0], previous: x[1], printed: x[3], kind: k }; }
    return null;
  };
  if (glued != null) { const g = attempt([glued, ...f]); if (g) return g; }
  const plain = attempt(f);
  if (plain) return plain;
  // Two figures, nothing printed to verify: accepted only when no figure is stuck to the label (it would mean we are one column short), and when the pair is plausible.
  if (f.length === 2 && glued == null) {
    const c = pctChange(f[0], f[1]);
    if (f[0] >= 0 && f[1] >= 0 && (c == null || Math.abs(c) <= 1000)) return { current: f[0], previous: f[1], printed: null, kind: null };
  }
  return null;
}

export function readReportedRatios(pages: PdfPage[]): ReportedRatio[] {
  const out: ReportedRatio[] = [];
  for (const page of pages) {
    const lines = page.text.split("\n");
    const starts: { i: number; n: { id: RatioId; label: string } }[] = [];
    for (let i = 0; i < lines.length; i++) { const n = nameAt(lines, i); if (n) starts.push({ i, n }); }
    if (new Set(starts.map((x) => x.n.id)).size < MIN_RATIOS_ON_PAGE) continue;
    const basis = basisOf(`${page.text.slice(0, 500)} ${page.text.slice(-500)}`);
    const seen = new Set<RatioId>();
    starts.forEach(({ i, n }, k) => {
      if (seen.has(n.id)) return;
      const end = k + 1 < starts.length ? starts[k + 1].i : Math.min(lines.length, i + 14);
      // The first line of the block that ends in figures carries this ratio's figures. A block that runs past 12 lines is prose, not a table row.
      let found: { figures: number[]; glued: number | null } | null = null, at = -1;
      for (let j = i; j < Math.min(end, i + 12); j++) {
        const f = trailingFigures(lines[j]);
        if (f.figures.length >= 2 || (f.figures.length === 2 && f.glued != null)) { found = f; at = j; break; }
      }
      if (!found) return;
      const a = align(found.figures, found.glued);
      if (!a || at < 0) return;
      const computed = pctChange(a.current, a.previous);
      seen.add(n.id);
      out.push({
        id: n.id, label: n.label.replace(/\s+/g, " "), current: a.current, previous: a.previous, printed_variance: a.printed, variance_kind: a.kind, computed_variance: computed,
        page: page.num, basis, source: lines.slice(i, at + 1).join(" ").replace(/\t/g, " ").replace(/\s+/g, " ").trim().slice(0, 240),
      });
    });
  }
  return out;
}

// ---- what they say ----------------------------------------------------------------------------------------------------------

/** SEBI asks for reasons whenever a ratio moves by 25% or more, so a move that size is the company flagging itself. */
export const SELF_FLAG_MOVE = 25;
const NAME: Record<RatioId, string> = {
  current_ratio: "Current ratio", debt_equity: "Debt-equity ratio", dscr: "Debt service coverage ratio", interest_cover: "Interest coverage ratio", roe: "Return on equity",
  roce: "Return on capital employed", roi: "Return on investment", inventory_turnover: "Inventory turnover", receivables_turnover: "Receivables turnover",
  payables_turnover: "Payables turnover", net_capital_turnover: "Net capital turnover", net_margin: "Net profit margin", operating_margin: "Operating profit margin",
};

export function ratioFindings(ratios: ReportedRatio[]): NoteFinding[] {
  const out: NoteFinding[] = [];
  const done = new Set<string>();
  for (const r of ratios) {
    // The same ratio printed on two pages (the report and the notes) is one finding.
    const key = `${r.id}|${r.basis}|${r.current}|${r.previous}`;
    if (done.has(key)) continue;
    done.add(key);
    // A ratio the company prints with a percentage-point change is not judged on a relative move (9.7% to 15.1% is 5.4 points, not "56%").
    if (r.variance_kind === "points") continue;
    const v = r.computed_variance;
    if (v == null || Math.abs(v) < SELF_FLAG_MOVE) continue;
    // A debt-equity ratio of 0.04 going to 0.07 is "+58%" and means nothing: only judge a ratio that is large enough for a percentage to be meaningful.
    if (Math.max(Math.abs(r.current), Math.abs(r.previous)) < 0.5) continue;
    out.push({
      id: `ratio_${r.id}`, severity: "info", page: r.page,
      title: `${NAME[r.id]} moved ${v > 0 ? "up" : "down"} ${Math.abs(v).toFixed(0)}% (${r.previous} to ${r.current})`,
      detail: `The company's own disclosure${r.basis ? ` (${r.basis})` : ""}. A move of ${SELF_FLAG_MOVE}% or more has to be explained in the report; read the reasons next to the table.`,
    });
  }
  return out;
}

export type RatioCheck = { id: RatioId; reported: number; computed: number; page: number; agrees: boolean; detail: string };

/** The company's own figure against Sentinel's, for the two ratios whose definition does not vary: current ratio (current assets over current liabilities) and
 * net profit margin (profit after tax over revenue). Only when the table's basis is known and is the basis the statement was read on. */
export function crossCheck(ratios: ReportedRatio[], stmt: Pick<FinancialStatement, "current_assets" | "current_liabilities" | "profit_after_tax" | "revenue_from_operations" | "basis">): RatioCheck[] {
  const out: RatioCheck[] = [];
  for (const r of ratios) {
    if (r.basis != null && r.basis !== stmt.basis) continue;
    if (r.id === "current_ratio" && stmt.current_assets != null && stmt.current_liabilities != null && stmt.current_liabilities > 0) {
      const computed = stmt.current_assets / stmt.current_liabilities;
      const agrees = Math.abs(computed - r.current) <= 0.06;
      out.push({ id: r.id, reported: r.current, computed, page: r.page, agrees, detail: `The company reports a current ratio of ${r.current}; Sentinel computes ${computed.toFixed(2)} from the statements it read (current assets ${stmt.current_assets.toLocaleString("en-IN")} over current liabilities ${stmt.current_liabilities.toLocaleString("en-IN")}).` });
    }
    if (r.id === "net_margin" && stmt.revenue_from_operations > 0) {
      const computed = (stmt.profit_after_tax / stmt.revenue_from_operations) * 100;
      const agrees = Math.abs(computed - r.current) <= 1.0;
      out.push({ id: r.id, reported: r.current, computed, page: r.page, agrees, detail: `The company reports a net profit margin of ${r.current}%; Sentinel computes ${computed.toFixed(1)}% (profit after tax over revenue from operations).` });
    }
  }
  return out;
}
