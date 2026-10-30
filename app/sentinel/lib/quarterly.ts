// Sentinel - the quarterly engine. An analyst's day turns on a company's quarterly result: what changed against the quarter before,
// against the same quarter last year, over the trailing twelve months, and against the peers that have reported. This builds that
// "results-day brief" from statements already on file, deterministically: every figure is a subtraction or a ratio of imported
// lines, and every flag says which line and which threshold.
//
// Two facts about Indian quarterly results shape it. Quarterly results carry the PROFIT AND LOSS only (the balance sheet and cash
// flow come half-yearly), so the brief is about the P&L. And a peer is matched on the SAME period end date, not the same label,
// so companies with different fiscal years are compared on the same three months.

import { croreFactor } from "./units";
import { fiscalYearEnd, fiscalYearOf, lastDayOfMonth, isoDate, periodForEndDate } from "./autofill/periods";
import { getSectorConfig } from "./config";
import type { FinancialStatement, Workspace } from "./types";

export const isQuarter = (s: Pick<FinancialStatement, "period_type">) => s.period_type !== "FY";

/** End of the month three months before `iso` (a quarter end's predecessor). */
export function priorQuarterEnd(iso: string, monthsBack = 3): string {
  const [y, m] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) - monthsBack;
  const year = Math.floor(total / 12), month = (total % 12) + 1;
  return isoDate(year, month, lastDayOfMonth(year, month));
}

/** The quarter before this one, same company and basis. The first quarter of a year follows the last quarter of the previous year. */
export function findPriorQuarter(stmt: FinancialStatement, all: FinancialStatement[]): FinancialStatement | null {
  const end = priorQuarterEnd(stmt.period_end_date);
  return all.find((o) => o.workspace_id === stmt.workspace_id && isQuarter(o) && o.basis === stmt.basis && o.period_end_date === end) ?? null;
}

/** The same quarter a year earlier, same company and basis. */
export function findSameQuarterLastYear(stmt: FinancialStatement, all: FinancialStatement[]): FinancialStatement | null {
  const end = priorQuarterEnd(stmt.period_end_date, 12);
  return all.find((o) => o.workspace_id === stmt.workspace_id && isQuarter(o) && o.basis === stmt.basis && o.period_end_date === end) ?? null;
}

// ---- figures ----------------------------------------------------------------------------------------------------------------

export type QuarterFigures = {
  revenue: number;
  ebitda: number | null;
  other_income: number | null;
  pbt: number;
  pat: number;
  exceptional: number | null;
  tax_rate: number | null;
  ebitda_margin: number | null;
  pat_margin: number | null;
  other_income_share: number | null;
};

const ratio = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null || b === 0 ? null : a / b);

/** The P&L lines of one statement, in crore. */
export function figures(s: FinancialStatement, factor: number): QuarterFigures {
  const x = (v: number | null | undefined) => (v == null ? null : v * factor);
  const revenue = s.revenue_from_operations * factor;
  const pbt = s.profit_before_tax * factor;
  return {
    revenue,
    ebitda: x(s.ebitda),
    other_income: x(s.other_income),
    pbt,
    pat: s.profit_after_tax * factor,
    exceptional: x(s.exceptional_items),
    tax_rate: pbt > 0 ? ratio(s.tax_expense, s.profit_before_tax) : null,
    ebitda_margin: ratio(s.ebitda, s.revenue_from_operations),
    pat_margin: ratio(s.profit_after_tax, s.revenue_from_operations),
    other_income_share: pbt > 0 ? ratio(s.other_income, s.profit_before_tax) : null,
  };
}

/** Change against a prior figure, measured against its size so the sign is always the direction of the move (as everywhere else). */
const change = (cur: number | null, prior: number | null) => (cur == null || prior == null || prior === 0 ? null : (cur - prior) / Math.abs(prior));
/** Difference between two ratios, as a fraction (0.012 = 120 basis points). */
const diff = (cur: number | null, prior: number | null) => (cur == null || prior == null ? null : cur - prior);

// ---- trailing twelve months ---------------------------------------------------------------------------------------------------

export type Ttm = {
  revenue: number;
  ebitda: number | null;
  pat: number;
  ebitda_margin: number | null;
  pat_margin: number | null;
  /** "four quarters" when summed, "financial year" when the quarter closes the year and the audited year is on file. */
  basis: "four quarters" | "financial year";
  labels: string[];
};
export type TtmResult = { ttm: Ttm } | { missing: string[] };

/** Trailing twelve months: the quarter and the three before it, added. A quarter that closes the year uses the audited year when it is on file. */
export function trailingTwelveMonths(stmt: FinancialStatement, all: FinancialStatement[], factor: number, fyStartMonth: number): TtmResult {
  const [y, m] = stmt.period_end_date.split("-").map(Number);
  if (stmt.period_end_date === fiscalYearEnd(fiscalYearOf(y, m, fyStartMonth), fyStartMonth)) {
    const fy = all.find((o) => o.workspace_id === stmt.workspace_id && o.period_type === "FY" && o.basis === stmt.basis && o.period_end_date === stmt.period_end_date);
    if (fy) return { ttm: sum([fy], factor, "financial year") };
  }
  const chain: FinancialStatement[] = [stmt];
  const missing: string[] = [];
  for (let i = 1; i < 4; i++) {
    const end = priorQuarterEnd(stmt.period_end_date, 3 * i);
    const found = all.find((o) => o.workspace_id === stmt.workspace_id && isQuarter(o) && o.basis === stmt.basis && o.period_end_date === end);
    if (found) chain.push(found);
    else missing.push(periodForEndDate(end, "quarter", fyStartMonth).period_label);
  }
  if (missing.length > 0) return { missing };
  return { ttm: sum(chain, factor, "four quarters") };
}

function sum(parts: FinancialStatement[], factor: number, basis: Ttm["basis"]): Ttm {
  const rev = parts.reduce((n, s) => n + s.revenue_from_operations, 0);
  const pat = parts.reduce((n, s) => n + s.profit_after_tax, 0);
  const allEbitda = parts.every((s) => s.ebitda != null);
  const ebitda = allEbitda ? parts.reduce((n, s) => n + (s.ebitda as number), 0) : null;
  return {
    revenue: rev * factor, ebitda: ebitda == null ? null : ebitda * factor, pat: pat * factor,
    ebitda_margin: ratio(ebitda, rev), pat_margin: ratio(pat, rev), basis, labels: parts.map((p) => p.period_label),
  };
}

// ---- the brief ----------------------------------------------------------------------------------------------------------------

export type LineKind = "amount" | "margin" | "rate";
export type BriefLine = {
  key: string;
  label: string;
  kind: LineKind;
  current: number | null;
  prior_quarter: number | null;
  prior_year: number | null;
  /** For an amount, the fractional change; for a margin or rate, the difference in percentage points as a fraction. */
  qoq: number | null;
  yoy: number | null;
};

export type PeerQuarter = {
  workspace_id: string;
  company_name: string;
  basis: string;
  revenue_yoy: number | null;
  revenue_qoq: number | null;
  ebitda_margin: number | null;
  ebitda_margin_yoy: number | null;
  pat_margin: number | null;
  pat_yoy: number | null;
};

export type BriefFlag = { id: string; severity: number; title: string; detail: string };

export type ResultsBrief = {
  workspace_id: string;
  company_name: string;
  sector: string;
  period_label: string;
  period_end_date: string;
  basis: string;
  prior_quarter_label: string | null;
  prior_year_label: string | null;
  lines: BriefLine[];
  ttm: TtmResult;
  peers: { reported: PeerQuarter[]; not_reported: string[]; median: { revenue_yoy: number | null; ebitda_margin: number | null; pat_margin: number | null } };
  flags: BriefFlag[];
  notes: string[];
};

const median = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

/** Starting assumptions, like the annual thresholds in config.ts: not calibrated against filings, and said so in each flag. */
export const QUARTER_THRESHOLDS = {
  revenue_qoq: 0.5, // x the sector's annual swing threshold
  margin_yoy: 0.02, // 200 basis points
  margin_qoq: 0.015, // 150 basis points
  other_income_share: 0.25,
  tax_rate_low: 0.15,
  tax_rate_high: 0.35,
  peer_margin_gap: 0.05, // 5 percentage points from the peer median
  peer_growth_gap: 0.1, // 10 percentage points from the peer median
};

const pct = (v: number, dp = 1) => `${(v * 100).toFixed(dp)}%`;
const signedPct = (v: number, dp = 1) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(dp)}%`;
const bps = (v: number) => `${Math.abs(Math.round(v * 10_000))} bps`;
const cr = (v: number) => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} cr`;

/** The quarter this company reported on `periodEnd` (latest on file when omitted), preferring its own comparison basis. */
export function pickQuarter(ws: Workspace, statements: FinancialStatement[], periodEnd?: string): FinancialStatement | null {
  const mine = statements.filter((s) => s.workspace_id === ws.id && isQuarter(s) && (!periodEnd || s.period_end_date === periodEnd));
  if (mine.length === 0) return null;
  const latest = mine.reduce((a, b) => (b.period_end_date > a.period_end_date ? b : a)).period_end_date;
  const atLatest = mine.filter((s) => s.period_end_date === latest);
  return atLatest.find((s) => s.basis === ws.comparison_basis) ?? atLatest[0];
}

export function buildResultsBrief(workspaces: Workspace[], statements: FinancialStatement[], subjectId: string, periodEnd?: string): ResultsBrief | null {
  const ws = workspaces.find((w) => w.id === subjectId);
  if (!ws) return null;
  const stmt = pickQuarter(ws, statements, periodEnd);
  if (!stmt) return null;
  const f = croreFactor(ws.currency_unit);
  const pq = findPriorQuarter(stmt, statements);
  const py = findSameQuarterLastYear(stmt, statements);
  const cur = figures(stmt, f), q = pq ? figures(pq, f) : null, y = py ? figures(py, f) : null;
  const notes: string[] = [];
  if (stmt.basis !== ws.comparison_basis) notes.push(`Using ${stmt.basis} figures: ${ws.comparison_basis} is not on file for this quarter.`);
  if (!pq) notes.push(`The previous quarter (${periodForEndDate(priorQuarterEnd(stmt.period_end_date), "quarter", ws.fiscal_year_start_month || 4).period_label}, ${stmt.basis}) is not on file, so there is no quarter-on-quarter comparison.`);
  if (!py) notes.push(`The same quarter last year (${periodForEndDate(priorQuarterEnd(stmt.period_end_date, 12), "quarter", ws.fiscal_year_start_month || 4).period_label}, ${stmt.basis}) is not on file, so there is no year-on-year comparison.`);

  const amount = (key: string, label: string, pick: (x: QuarterFigures) => number | null): BriefLine => ({
    key, label, kind: "amount", current: pick(cur), prior_quarter: q ? pick(q) : null, prior_year: y ? pick(y) : null,
    qoq: q ? change(pick(cur), pick(q)) : null, yoy: y ? change(pick(cur), pick(y)) : null,
  });
  const margin = (key: string, label: string, pick: (x: QuarterFigures) => number | null, kind: LineKind = "margin"): BriefLine => ({
    key, label, kind, current: pick(cur), prior_quarter: q ? pick(q) : null, prior_year: y ? pick(y) : null,
    qoq: q ? diff(pick(cur), pick(q)) : null, yoy: y ? diff(pick(cur), pick(y)) : null,
  });
  const lines: BriefLine[] = [
    amount("revenue", "Revenue from operations", (x) => x.revenue),
    amount("ebitda", "EBITDA", (x) => x.ebitda),
    margin("ebitda_margin", "EBITDA margin", (x) => x.ebitda_margin),
    amount("other_income", "Other income", (x) => x.other_income),
    amount("pbt", "Profit before tax", (x) => x.pbt),
    amount("pat", "Profit after tax", (x) => x.pat),
    margin("pat_margin", "PAT margin", (x) => x.pat_margin),
    margin("tax_rate", "Effective tax rate", (x) => x.tax_rate, "rate"),
  ];

  const ttm = trailingTwelveMonths(stmt, statements, f, ws.fiscal_year_start_month || 4);

  // Peers: same sector, the same period end, each on its own comparison basis.
  const reported: PeerQuarter[] = [];
  const notReported: string[] = [];
  for (const p of workspaces) {
    if (p.id === ws.id || p.sector !== ws.sector) continue;
    const ps = pickQuarter(p, statements, stmt.period_end_date);
    if (!ps || ps.period_end_date !== stmt.period_end_date) { notReported.push(p.company_name); continue; }
    const pf = croreFactor(p.currency_unit);
    const pnow = figures(ps, pf);
    const ppq = findPriorQuarter(ps, statements), ppy = findSameQuarterLastYear(ps, statements);
    const pyf = ppy ? figures(ppy, pf) : null, pqf = ppq ? figures(ppq, pf) : null;
    reported.push({
      workspace_id: p.id, company_name: p.company_name, basis: ps.basis,
      revenue_yoy: pyf ? change(pnow.revenue, pyf.revenue) : null, revenue_qoq: pqf ? change(pnow.revenue, pqf.revenue) : null,
      ebitda_margin: pnow.ebitda_margin, ebitda_margin_yoy: pyf ? diff(pnow.ebitda_margin, pyf.ebitda_margin) : null,
      pat_margin: pnow.pat_margin, pat_yoy: pyf ? change(pnow.pat, pyf.pat) : null,
    });
  }
  const med = { revenue_yoy: median(reported.map((r) => r.revenue_yoy)), ebitda_margin: median(reported.map((r) => r.ebitda_margin)), pat_margin: median(reported.map((r) => r.pat_margin)) };
  if (reported.some((r) => r.basis !== stmt.basis)) notes.push("Some peers are on a different basis (standalone or consolidated) from this company: compare ratios, not absolute amounts.");

  // Flags
  const T = QUARTER_THRESHOLDS;
  const cfg = getSectorConfig(ws.sector).anomaly_thresholds;
  const yoyLimit = cfg.yoy_swing_pct / 100, qoqLimit = yoyLimit * T.revenue_qoq;
  const flags: BriefFlag[] = [];
  const revLine = lines[0], ebLine = lines[2], taxLine = lines[7];
  if (revLine.yoy != null && Math.abs(revLine.yoy) > yoyLimit) flags.push({ id: "revenue_yoy", severity: Math.abs(revLine.yoy) / yoyLimit, title: `Revenue ${revLine.yoy > 0 ? "up" : "down"} ${pct(Math.abs(revLine.yoy))} on the same quarter last year`, detail: `Past the sector's ${(yoyLimit * 100).toFixed(0)}% swing threshold. ${cr(cur.revenue)} against ${cr(y!.revenue)}.` });
  if (revLine.qoq != null && Math.abs(revLine.qoq) > qoqLimit) flags.push({ id: "revenue_qoq", severity: Math.abs(revLine.qoq) / qoqLimit, title: `Revenue ${revLine.qoq > 0 ? "up" : "down"} ${pct(Math.abs(revLine.qoq))} on the previous quarter`, detail: `Past ${(qoqLimit * 100).toFixed(1)}% (half the annual swing threshold, a starting assumption). ${cr(cur.revenue)} against ${cr(q!.revenue)}.` });
  if (ebLine.yoy != null && Math.abs(ebLine.yoy) > T.margin_yoy) flags.push({ id: "ebitda_margin_yoy", severity: Math.abs(ebLine.yoy) / T.margin_yoy, title: `EBITDA margin ${ebLine.yoy > 0 ? "up" : "down"} ${bps(ebLine.yoy)} on the same quarter last year`, detail: `${pct(cur.ebitda_margin as number)} against ${pct(y!.ebitda_margin as number)}; the threshold is ${T.margin_yoy * 10_000} bps (a starting assumption).` });
  if (ebLine.qoq != null && Math.abs(ebLine.qoq) > T.margin_qoq) flags.push({ id: "ebitda_margin_qoq", severity: Math.abs(ebLine.qoq) / T.margin_qoq, title: `EBITDA margin ${ebLine.qoq > 0 ? "up" : "down"} ${bps(ebLine.qoq)} on the previous quarter`, detail: `${pct(cur.ebitda_margin as number)} against ${pct(q!.ebitda_margin as number)}; the threshold is ${T.margin_qoq * 10_000} bps (a starting assumption).` });
  if (cur.exceptional != null && cur.pbt > 0 && Math.abs(cur.exceptional) / cur.pbt > cfg.exceptional_item_pct_of_pbt / 100) flags.push({ id: "exceptional", severity: (Math.abs(cur.exceptional) / cur.pbt) / (cfg.exceptional_item_pct_of_pbt / 100), title: `Exceptional items are ${pct(Math.abs(cur.exceptional) / cur.pbt, 0)} of profit before tax`, detail: `${cr(Math.abs(cur.exceptional))} ${cur.exceptional < 0 ? "gain" : "charge"} against a ${cfg.exceptional_item_pct_of_pbt}% threshold: compare profit before and after it.` });
  if (cur.other_income_share != null && cur.other_income_share > T.other_income_share) flags.push({ id: "other_income", severity: cur.other_income_share / T.other_income_share, title: `Other income is ${pct(cur.other_income_share, 0)} of profit before tax`, detail: `Profit leans on non-operating income (${cr(cur.other_income as number)} of ${cr(cur.pbt)}); the threshold is ${T.other_income_share * 100}% (a starting assumption).` });
  if (cur.tax_rate != null && (cur.tax_rate < T.tax_rate_low || cur.tax_rate > T.tax_rate_high)) flags.push({ id: "tax_rate", severity: cur.tax_rate < T.tax_rate_low ? T.tax_rate_low / Math.max(cur.tax_rate, 0.01) : cur.tax_rate / T.tax_rate_high, title: `Effective tax rate ${pct(cur.tax_rate)} is outside ${T.tax_rate_low * 100}-${T.tax_rate_high * 100}%`, detail: `A one-off tax item can lift or cut profit after tax without any change in the business.${taxLine.prior_quarter != null ? ` Previous quarter: ${pct(taxLine.prior_quarter)}.` : ""}` });
  if (med.ebitda_margin != null && cur.ebitda_margin != null && reported.length >= 2 && Math.abs(cur.ebitda_margin - med.ebitda_margin) > T.peer_margin_gap) flags.push({ id: "peer_margin", severity: Math.abs(cur.ebitda_margin - med.ebitda_margin) / T.peer_margin_gap, title: `EBITDA margin ${cur.ebitda_margin > med.ebitda_margin ? "above" : "below"} the peer median by ${(Math.abs(cur.ebitda_margin - med.ebitda_margin) * 100).toFixed(1)} points`, detail: `${pct(cur.ebitda_margin)} against a median of ${pct(med.ebitda_margin)} across ${reported.length} peers that have reported this quarter.` });
  if (med.revenue_yoy != null && revLine.yoy != null && reported.length >= 2 && Math.abs(revLine.yoy - med.revenue_yoy) > T.peer_growth_gap) flags.push({ id: "peer_growth", severity: Math.abs(revLine.yoy - med.revenue_yoy) / T.peer_growth_gap, title: `Revenue growth ${revLine.yoy > med.revenue_yoy ? "ahead of" : "behind"} the peer median by ${(Math.abs(revLine.yoy - med.revenue_yoy) * 100).toFixed(1)} points`, detail: `${signedPct(revLine.yoy)} year on year against a peer median of ${signedPct(med.revenue_yoy)}.` });
  flags.sort((a, b) => b.severity - a.severity);

  return {
    workspace_id: ws.id, company_name: ws.company_name, sector: ws.sector, period_label: stmt.period_label, period_end_date: stmt.period_end_date, basis: stmt.basis,
    prior_quarter_label: pq?.period_label ?? null, prior_year_label: py?.period_label ?? null, lines, ttm, peers: { reported, not_reported: notReported, median: med }, flags, notes,
  };
}

/** Quarter end dates the company has on file, newest first, for a picker. */
export function quartersOnFile(ws: Workspace, statements: FinancialStatement[]): { end: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const s of statements) if (s.workspace_id === ws.id && isQuarter(s) && !seen.has(s.period_end_date)) seen.set(s.period_end_date, s.period_label);
  return [...seen.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([end, label]) => ({ end, label }));
}
