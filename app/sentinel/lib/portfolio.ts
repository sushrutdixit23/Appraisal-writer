// Sentinel - the portfolio: what a person holds, how big each position is, and which positions carry something worth reading. The coverage digest ranks problems
// company by company; it cannot say that one of them is 8% of the book and another is 0.4%. This can: each holding is weighted by its share of the portfolio and each
// finding on the company (the notes to its latest annual report, the auditor's report, a covenant) is multiplied by that weight, so the list that comes out is ordered by
// how much of the book sits under it.
//
// Three honest limits, shown with the numbers rather than buried:
//  - Weights are by market value only when EVERY holding has a price (the price is the person's own entry or the refresh feed, with its date); otherwise by cost, and the
//    page says which. A mixed basis would weight a priced position against an unpriced one on different scales.
//  - A holding with no annual report read on file is a BLIND SPOT, and the share of the book in blind spots is reported next to the share with findings. "Nothing found"
//    is only reassuring where something was read.
//  - The score is weight times severity, nothing cleverer. It is a way to order the reading, not a measure of risk.

import { parseChecks } from "./autofill/annualChecks";
import { NOTE_LABEL, parseNotes } from "./autofill/notes";
import { evaluateAll, type CovenantRow } from "./covenants";
import type { FinancialStatement, Workspace } from "./types";

export type HoldingRow = { id?: string; workspace_id: string; quantity: number; avg_cost: number | null; notes?: string | null };
export type PortfolioFinding = { source: "notes" | "auditor" | "covenant"; severity: "high" | "medium"; title: string; detail: string; page: number | null };

export type PositionRow = {
  holding: HoldingRow;
  workspace: Workspace;
  price: number | null;
  price_as_of: string | null;
  price_stale: boolean;
  value: number | null;
  cost_value: number | null;
  /** Share of the portfolio on the portfolio's weight basis, 0 to 1. */
  weight: number;
  /** Price against average cost, as a fraction; null without both. */
  gain: number | null;
  findings: PortfolioFinding[];
  /** 3 for each high finding and 1 for each medium, capped. */
  points: number;
  /** weight x points: the figure the list is ordered by. */
  concern: number;
  /** The latest year whose annual-report notes are on file, or null: a blind spot. */
  notes_year: string | null;
  /** "newer_may_exist" when the latest audited year on file is old enough that the next annual report should be out. */
  report_status: "current" | "newer_may_exist" | "none";
};

export type Portfolio = {
  positions: PositionRow[];
  basis: "market" | "cost" | "equal";
  /** Total on the basis (rupees for market and cost; the number of holdings for equal). */
  total: number;
  /** Share of the book in companies with at least one high finding / with no annual-report notes read / whose next annual report should be out. */
  share_high: number;
  share_blind: number;
  share_newer: number;
  unpriced: string[];
};

export const PRICE_STALE_DAYS = 7; // as in digest.ts
export const SEVERITY_POINTS = { high: 3, medium: 1 } as const;
export const MAX_POINTS = 9;
/** A listed company files its annual report within 60 days of the year end (SEBI LODR). */
const ANNUAL_REPORT_DAYS = 365 + 60;

const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** The findings that matter on one company: the notes to its latest annual report, the auditor's report, and any covenant that is breached or tight. */
export function findingsFor(workspace: Workspace, statements: FinancialStatement[], covenants: CovenantRow[], today: string): { findings: PortfolioFinding[]; notes_year: string | null; latest_end: string | null } {
  const years = statements.filter((s) => s.workspace_id === workspace.id && s.period_type === "FY").sort((a, b) => b.period_end_date.localeCompare(a.period_end_date));
  const withNotes = years.find((s) => parseNotes(s.annual_report_notes));
  const withChecks = years.find((s) => parseChecks(s.annual_report_checks));
  const findings: PortfolioFinding[] = [];
  const notes = withNotes ? parseNotes(withNotes.annual_report_notes) : null;
  for (const f of notes?.findings ?? []) if (f.severity !== "info") findings.push({ source: "notes", severity: f.severity, title: f.title, detail: `${NOTE_LABEL[f.note]}, ${withNotes!.period_label}: ${f.detail}`, page: f.page });
  const checks = withChecks ? parseChecks(withChecks.annual_report_checks) : null;
  if (checks) {
    for (const f of checks.findings) if (f.severity !== "info") findings.push({ source: "auditor", severity: f.severity === "high" ? "high" : "medium", title: f.title, detail: `Auditor's report, ${withChecks!.period_label}: ${f.detail.slice(0, 240)}`, page: f.page });
  }
  for (const r of evaluateAll(covenants.filter((c) => c.workspace_id === workspace.id), statements, [workspace], today)) {
    if (r.status === "breach" || r.status === "tight") findings.push({ source: "covenant", severity: r.status === "breach" ? "high" : "medium", title: `${r.covenant.name}: covenant ${r.status === "breach" ? "breached" : "tight"}`, detail: r.reason, page: null });
  }
  return { findings, notes_year: withNotes?.period_label ?? null, latest_end: years[0]?.period_end_date ?? null };
}

export function buildPortfolio(holdings: HoldingRow[], workspaces: Workspace[], statements: FinancialStatement[], covenants: CovenantRow[], today: string): Portfolio {
  const byId = new Map(workspaces.map((w) => [w.id, w]));
  const rows = holdings.flatMap((h) => { const w = byId.get(h.workspace_id); return w && h.quantity > 0 ? [{ h, w }] : []; });

  const priced = rows.map(({ h, w }) => {
    const price = w.market_price != null && w.market_price > 0 ? w.market_price : null;
    const asOf = w.market_price_as_of ?? null;
    return { h, w, price, asOf, stale: price != null && (!asOf || days(asOf, today) > PRICE_STALE_DAYS), value: price != null ? h.quantity * price : null, cost: h.avg_cost != null && h.avg_cost > 0 ? h.quantity * h.avg_cost : null };
  });
  const allPriced = priced.length > 0 && priced.every((p) => p.value != null);
  const allCosted = priced.length > 0 && priced.every((p) => p.cost != null);
  const basis: Portfolio["basis"] = allPriced ? "market" : allCosted ? "cost" : "equal";
  const amount = (p: (typeof priced)[number]) => (basis === "market" ? p.value! : basis === "cost" ? p.cost! : 1);
  const total = priced.reduce((n, p) => n + amount(p), 0);

  const positions: PositionRow[] = priced.map((p) => {
    const f = findingsFor(p.w, statements, covenants, today);
    const points = Math.min(MAX_POINTS, f.findings.reduce((n, x) => n + SEVERITY_POINTS[x.severity], 0));
    const weight = total > 0 ? amount(p) / total : 0;
    const report_status: PositionRow["report_status"] = f.latest_end == null ? "none" : days(f.latest_end, today) > ANNUAL_REPORT_DAYS ? "newer_may_exist" : "current";
    return {
      holding: p.h, workspace: p.w, price: p.price, price_as_of: p.asOf, price_stale: p.stale, value: p.value, cost_value: p.cost, weight,
      gain: p.price != null && p.h.avg_cost != null && p.h.avg_cost > 0 ? p.price / p.h.avg_cost - 1 : null,
      findings: [...f.findings].sort((a, b) => SEVERITY_POINTS[b.severity] - SEVERITY_POINTS[a.severity]), points, concern: weight * points, notes_year: f.notes_year, report_status,
    };
  });
  positions.sort((a, b) => b.concern - a.concern || b.weight - a.weight || a.workspace.company_name.localeCompare(b.workspace.company_name));
  const share = (pred: (p: PositionRow) => boolean) => positions.filter(pred).reduce((n, p) => n + p.weight, 0);
  return {
    positions, basis, total,
    share_high: share((p) => p.findings.some((f) => f.severity === "high")),
    share_blind: share((p) => p.notes_year == null),
    share_newer: share((p) => p.report_status === "newer_may_exist"),
    unpriced: priced.filter((p) => p.value == null).map((p) => p.w.company_name),
  };
}

export const pctOf = (v: number, dp = 1) => `${(v * 100).toFixed(dp)}%`;

/** The portfolio's own digest lines: the positions with the most weight under a finding, with the weight in the sentence. */
export function exposureLines(p: Portfolio, limit = 5): { workspace_id: string; company_name: string; title: string; detail: string }[] {
  return p.positions
    .filter((x) => x.concern > 0)
    .slice(0, limit)
    .map((x) => {
      const top = x.findings[0];
      const more = x.findings.length - 1;
      return {
        workspace_id: x.workspace.id,
        company_name: x.workspace.company_name,
        title: `${x.workspace.company_name} - ${pctOf(x.weight)} of your book${p.basis === "market" ? "" : p.basis === "cost" ? " (by cost)" : " (equal weights)"}: ${top.title}`,
        detail: `${top.detail.slice(0, 220)}${top.detail.length > 220 ? "..." : ""}${top.page != null ? ` (p.${top.page})` : ""}${more > 0 ? ` ${more} more finding${more > 1 ? "s" : ""}.` : ""}`,
      };
    });
}

// ---- importing a list of holdings ---------------------------------------------------------------------------------------------

export type ImportedHolding = { workspace_id: string; company_name: string; quantity: number; avg_cost: number | null };
export type HoldingsImport = { matched: ImportedHolding[]; unmatched: { line: number; label: string; reason: string }[]; errors: string[] };

const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/\b(limited|ltd|pvt|private|the|company|co|corporation|corp|inc)\b\.?/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const num = (s: string | undefined) => { const n = Number((s ?? "").replace(/[₹,\s]/g, "").replace(/^\((.*)\)$/, "-$1")); return s != null && s.trim() !== "" && Number.isFinite(n) ? n : null; };

function splitCsv(line: string): string[] {
  const out: string[] = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === "," || c === "\t") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

const COLUMN: Record<"name" | "bse" | "qty" | "cost" | "invested", RegExp> = {
  name: /^(symbol|ticker|scrip|security|stock|company|name|instrument)( name)?$/i,
  bse: /^(bse( scrip)? ?code|scrip ?code|bse)$/i,
  qty: /^(quantity|qty|shares|units|holding|no\.? of shares)$/i,
  cost: /^(avg\.?|average)( buy| cost| price)*( price| cost)?$|^(buy|purchase|cost) price$|^avg cost$/i,
  invested: /^(invested( value| amount)?|cost value|total cost|buy value)$/i,
};

/** A broker holdings export (Zerodha, Groww, an Excel sheet saved as CSV) matched to the projects a person can read: by BSE code, then ticker, then company name with
 * "Limited" and its kin ignored. A row that matches nothing is returned with the reason, never dropped silently and never matched on a guess. */
export function parseHoldingsCsv(text: string, workspaces: Pick<Workspace, "id" | "company_name" | "ticker" | "bse_code">[]): HoldingsImport {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const out: HoldingsImport = { matched: [], unmatched: [], errors: [] };
  if (lines.length < 2) { out.errors.push("The file needs a header row and at least one holding."); return out; }
  const head = splitCsv(lines[0]);
  const col = (k: keyof typeof COLUMN) => head.findIndex((h) => COLUMN[k].test(h.trim()));
  const [iName, iBse, iQty, iCost, iInv] = [col("name"), col("bse"), col("qty"), col("cost"), col("invested")];
  if (iQty < 0) out.errors.push("No quantity column found (expected Quantity, Qty or Shares).");
  if (iName < 0 && iBse < 0) out.errors.push("No company column found (expected Symbol, Company or BSE code).");
  if (out.errors.length) return out;

  const byBse = new Map(workspaces.filter((w) => w.bse_code).map((w) => [String(w.bse_code).trim(), w]));
  const byTicker = new Map(workspaces.filter((w) => w.ticker).map((w) => [String(w.ticker).trim().toUpperCase(), w]));
  const byName = new Map<string, (typeof workspaces)[number][]>();
  for (const w of workspaces) byName.set(norm(w.company_name), [...(byName.get(norm(w.company_name)) ?? []), w]);

  const seen = new Set<string>();
  lines.slice(1).forEach((line, i) => {
    const c = splitCsv(line);
    const label = (iName >= 0 ? c[iName] : c[iBse]) || `row ${i + 2}`;
    const qty = num(c[iQty]);
    if (qty == null || qty <= 0) { out.unmatched.push({ line: i + 2, label, reason: "the quantity is not a positive number" }); return; }
    let w = iBse >= 0 && c[iBse] ? byBse.get(c[iBse].trim()) : undefined;
    if (!w && iName >= 0 && c[iName]) {
      w = byTicker.get(c[iName].trim().toUpperCase());
      if (!w) { const hits = byName.get(norm(c[iName])) ?? []; w = hits.length === 1 ? hits[0] : undefined; if (hits.length > 1) { out.unmatched.push({ line: i + 2, label, reason: "more than one project has that name" }); return; } }
    }
    if (!w) { out.unmatched.push({ line: i + 2, label, reason: "no project has this BSE code, ticker or name - create it first, or set its BSE code or ticker under Settings" }); return; }
    if (seen.has(w.id)) { out.unmatched.push({ line: i + 2, label, reason: `${w.company_name} appears twice; the first row was kept` }); return; }
    seen.add(w.id);
    const direct = iCost >= 0 ? num(c[iCost]) : null;
    const invested = iInv >= 0 ? num(c[iInv]) : null;
    out.matched.push({ workspace_id: w.id, company_name: w.company_name, quantity: qty, avg_cost: direct != null && direct >= 0 ? direct : invested != null && invested >= 0 ? invested / qty : null });
  });
  return out;
}

export function validateHolding(input: Record<string, unknown>): { ok: true; row: Omit<HoldingRow, "id"> } | { ok: false; error: string } {
  const quantity = typeof input.quantity === "number" ? input.quantity : NaN;
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1e12) return { ok: false, error: "The quantity must be a positive number." };
  const cost = input.avg_cost == null || input.avg_cost === "" ? null : input.avg_cost;
  if (cost !== null && (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0 || cost > 1e9)) return { ok: false, error: "The average cost must be zero or more, or left empty." };
  const notes = typeof input.notes === "string" ? input.notes.trim().slice(0, 300) || null : null;
  return { ok: true, row: { workspace_id: String(input.workspace_id ?? ""), quantity, avg_cost: cost as number | null, notes } };
}
