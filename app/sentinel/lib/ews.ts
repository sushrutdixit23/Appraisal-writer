// Sentinel - the early-warning-signal checklist: a lender's EWS list, tested against what Sentinel has actually read of a company's latest annual report, one line per
// indicator with one of four statuses and the page and words behind it.
//
//   hit            the indicator is present, with the page and the printed words (or the computed figures).
//   clear          the reader that covers it READ the relevant note or figures and found it absent. Never given for "nothing was raised": a note that was not read is not clear.
//   not_read       Sentinel can test this indicator but could not for this company and year (the note was not recognised, a figure is missing, or the notes were stored
//                  before the detail needed was kept). Says which, so it can be fixed.
//   not_readable   an indicator that cannot be read from an annual report at all (a ROC charge register, a pledge filing, bank account conduct), with what it would need.
//
// WHAT THE LIST IS, AND IS NOT. The seven indicators in RBI_LIST are the ones a research report (Sentinel: Analyst Workflow Research, Nov 2026) quotes from a law-firm
// summary of the RBI Master Directions on Fraud Risk Management (15 July 2024). They have NOT been checked against the RBI text: the sandbox this was built in cannot
// reach rbi.org.in. The same report notes that the 2024 directions leave each lender's board to approve its own indicators, so this is a starting template, not a
// statement of what RBI requires. The wording of each is shown as quoted, with that provenance, on the page.
//
// A second group, ALSO_READ, is what Sentinel reads in a filing that is not on that list (CARO fraud, default and cash-loss answers, an adverse or qualified opinion,
// a going-concern uncertainty). They are labelled as Sentinel's own, so nobody mistakes them for a regulatory list.

import { parseChecks } from "./autofill/annualChecks";
import { parseNotes, type AnnualNotes } from "./autofill/notes";
import { getSectorConfig } from "./config";
import type { FinancialStatement, Workspace } from "./types";

export type EwsStatus = "hit" | "clear" | "not_read" | "not_readable";
export type EwsGroup = "rbi_list" | "also_read";
export type EwsEvidence = { page: number | null; text: string };
export type EwsItem = {
  id: string;
  group: EwsGroup;
  /** The indicator as worded in its source. For ALSO_READ it is Sentinel's own wording. */
  wording: string;
  status: EwsStatus;
  evidence: EwsEvidence[];
  /** One sentence: why it has this status. */
  reason: string;
  /** What is tested, so a reader can judge the test. */
  how: string;
  /** What this test cannot see. */
  limit: string;
};
export type EwsChecklist = {
  period_label: string | null;
  basis: string | null;
  items: EwsItem[];
  summary: Record<EwsStatus, number>;
  /** True when there is no annual report on file to test at all. */
  empty: boolean;
};

export const EWS_SOURCE_NOTE =
  "The first seven indicators are the ones quoted in a research report from a law-firm summary of the RBI Master Directions on Fraud Risk Management (15 July 2024). They are not checked against the RBI text, and the directions leave each lender's board to approve its own list: treat this as a starting template.";

/** Starting assumptions, not calibrated. */
export const EWS_THRESHOLDS = {
  /** Total borrowings up by at least this share on the year before... */
  debt_growth: 0.1,
  /** ...while cash and equivalents are at least this share of the year-end borrowings. */
  cash_to_debt: 0.5,
};

type Draft = Omit<EwsItem, "status" | "evidence" | "reason"> & { status?: EwsStatus; evidence?: EwsEvidence[]; reason?: string };

const RBI_LIST: Draft[] = [
  {
    id: "statutory_dues", group: "rbi_list", wording: "Default in undisputed payment to the statutory bodies as declared in the Annual report",
    how: "The auditor's CARO clause (vii) on statutory dues: adverse wording is a hit, the standard clean wording is clear.",
    limit: "Reads the auditor's declaration, not the company's ledgers. A clause whose wording is not recognised is reported as not read, not as clear.",
  },
  {
    id: "roc_liabilities", group: "rbi_list", wording: "Liabilities appearing in ROC search report, not reported by the borrower in its annual report",
    how: "Not tested.",
    limit: "Needs the borrower's charges from the Registrar of Companies (MCA), which Sentinel does not read yet. It cannot be answered from the annual report alone.",
  },
  {
    id: "unbilled_revenue", group: "rbi_list", wording: "Substantial increase in unbilled revenue year after year",
    how: "Unbilled revenue growth against revenue growth over the latest year on file; a gap past the sector's configured threshold is a hit.",
    limit: "Needs unbilled revenue entered or read for two consecutive years. Companies that print it inside receivables are not split out.",
  },
  {
    id: "inconsistency", group: "rbi_list", wording: "Significant inconsistencies within the annual report (between various sections)",
    how: "The company's own disclosed current ratio and net margin against the same ratios computed from its statements; a disagreement is a hit.",
    limit: "Only these two cross-checks exist today. It does not compare other sections, and a misread statement shows up as a disagreement, so a hit is a prompt to check both pages.",
  },
  {
    id: "poor_disclosure", group: "rbi_list", wording: "Poor disclosure of materially adverse information and no qualification by the statutory auditors",
    how: "Not tested.",
    limit: "A judgement about what was left out. Sentinel reads what is printed; it cannot see what is absent.",
  },
  {
    id: "borrowing_despite_cash", group: "rbi_list", wording: "Increase in borrowings, despite huge cash and cash equivalents",
    how: `Total borrowings up by at least ${EWS_THRESHOLDS.debt_growth * 100}% on the year before while cash and equivalents are at least ${EWS_THRESHOLDS.cash_to_debt * 100}% of year-end borrowings (starting assumptions).`,
    limit: "Uses the statement figures on file for the two years on the same basis. Cash held for a stated purpose, or restricted, is not separated.",
  },
  {
    id: "promoter_pledge", group: "rbi_list", wording: "Significant reduction in the stake of promoter/director or increase in the encumbered shares",
    how: "Not tested.",
    limit: "Needs the quarterly shareholding pattern and pledge disclosures (BSE/NSE), which Sentinel does not read yet.",
  },
];

const ALSO_READ: Draft[] = [
  { id: "caro_fraud", group: "also_read", wording: "CARO clause (xi): the auditor's answer on fraud", how: "The auditor's CARO clause (xi), including a section 143(12) report filed in Form ADT-4.", limit: "Reads what the auditor wrote; the materiality judgement behind it is the auditor's." },
  { id: "caro_default", group: "also_read", wording: "CARO clause (ix): default in repayment of borrowings", how: "The auditor's CARO clause (ix).", limit: "As above." },
  { id: "caro_cash_losses", group: "also_read", wording: "CARO clause (xvii): cash losses", how: "The auditor's CARO clause (xvii).", limit: "As above." },
  { id: "caro_liabilities", group: "also_read", wording: "CARO clause (xix): ability to meet liabilities within a year", how: "The auditor's CARO clause (xix).", limit: "As above." },
  { id: "opinion", group: "also_read", wording: "The auditor's opinion is qualified, adverse or disclaimed", how: "The auditor's report: a Basis for Qualified, Adverse or Disclaimer paragraph.", limit: "Reads the paragraph headings the standards require; an unusual layout may be missed and is then not read." },
  { id: "going_concern", group: "also_read", wording: "The auditor reports a material uncertainty about going concern", how: "The auditor's report: a Material Uncertainty Related to Going Concern paragraph.", limit: "As above." },
];

// ---- tests ------------------------------------------------------------------------------------------------------------------

const CARO_BY_ITEM: Record<string, string> = { statutory_dues: "vii", caro_fraud: "xi", caro_default: "ix", caro_cash_losses: "xvii", caro_liabilities: "xix" };

function caroTest(item: Draft, notes: AnnualNotes | null): Pick<EwsItem, "status" | "evidence" | "reason"> {
  const clause = CARO_BY_ITEM[item.id];
  if (!notes) return { status: "not_read", evidence: [], reason: "No annual-report notes are on file for this company." };
  if (!notes.caro_clauses) {
    const adverse = notes.findings.filter((f) => f.id === `caro_${clause}`);
    if (adverse.length) return { status: "hit", evidence: adverse.map((f) => ({ page: f.page, text: f.detail })), reason: "The auditor's answer on this clause is not the clean one." };
    return { status: "not_read", evidence: [], reason: "These notes were stored before clause-by-clause results were kept, so 'nothing raised' cannot be told from 'not read'. Import the annual report again to test it." };
  }
  const hits = notes.caro_clauses.filter((c) => c.id === clause);
  if (hits.length === 0) return { status: "not_read", evidence: [], reason: `CARO clause (${clause}) was not found in the report, so it is not marked clear.` };
  const adverse = hits.filter((c) => c.status === "adverse");
  if (adverse.length) {
    const finding = notes.findings.filter((f) => f.id === `caro_${clause}`);
    return { status: "hit", evidence: (finding.length ? finding.map((f) => ({ page: f.page, text: f.detail })) : adverse.map((c) => ({ page: c.page, text: `Clause (${clause}) is not the standard clean answer.` }))), reason: "The auditor's answer on this clause is not the clean one." };
  }
  if (hits.some((c) => c.status === "read_it")) return { status: "not_read", evidence: hits.map((c) => ({ page: c.page, text: `Clause (${clause}) is present but its wording was not recognised as clean or adverse. Read it.` })), reason: "The clause is there, but its wording was not recognised, so it is not marked clear." };
  return { status: "clear", evidence: hits.map((c) => ({ page: c.page, text: `Clause (${clause}) carries the standard clean answer.` })), reason: "The clause was read and carries the standard clean answer." };
}

function opinionTest(item: Draft, checks: ReturnType<typeof parseChecks>): Pick<EwsItem, "status" | "evidence" | "reason"> {
  if (!checks) return { status: "not_read", evidence: [], reason: "The auditor's report is not on file for this company." };
  const wanted = item.id === "opinion" ? ["qualified", "adverse", "disclaimer"] : ["going_concern"];
  const found = checks.findings.filter((f) => wanted.includes(f.id));
  if (found.length) return { status: "hit", evidence: found.map((f) => ({ page: f.page, text: `${f.title}. ${f.detail}`.slice(0, 400) })), reason: item.id === "opinion" ? "The auditor's report contains a qualified, adverse or disclaimer paragraph." : "The auditor's report contains a going-concern uncertainty paragraph." };
  if (checks.opinion === "unknown") return { status: "not_read", evidence: [], reason: "The auditor's report was found but its opinion type was not recognised." };
  return { status: "clear", evidence: [], reason: item.id === "opinion" ? `The auditor's report was read and the opinion is ${checks.opinion}.` : "The auditor's report was read and has no going-concern uncertainty paragraph." };
}

/** The annual statement a year before `latest`, on the same basis (within a month of exactly a year, so a 52-week year is still matched). */
function sameBasisPrior(fy: FinancialStatement[], latest: FinancialStatement): FinancialStatement | null {
  const t = Date.parse(`${latest.period_end_date}T00:00:00Z`);
  return fy.find((s) => s.basis === latest.basis && Math.abs((t - Date.parse(`${s.period_end_date}T00:00:00Z`)) / 86_400_000 - 365) <= 31) ?? null;
}

function unbilledTest(ws: Workspace, latest: FinancialStatement | null, prior: FinancialStatement | null): Pick<EwsItem, "status" | "evidence" | "reason"> {
  if (!latest || !prior) return { status: "not_read", evidence: [], reason: "Two consecutive years on the same basis are needed and are not on file." };
  const u1 = latest.unbilled_revenue, u0 = prior.unbilled_revenue;
  if (u1 == null || u0 == null || u0 <= 0) return { status: "not_read", evidence: [], reason: "Unbilled revenue is not on file for both years, so this cannot be tested." };
  if (!(prior.revenue_from_operations > 0)) return { status: "not_read", evidence: [], reason: "Prior-year revenue is missing." };
  const uGrowth = (u1 - u0) / u0, rGrowth = (latest.revenue_from_operations - prior.revenue_from_operations) / prior.revenue_from_operations;
  const gapPp = (uGrowth - rGrowth) * 100;
  const threshold = getSectorConfig(ws.sector).anomaly_thresholds.unbilled_revenue_growth_gap_pct;
  const text = `Unbilled revenue ${u0} to ${u1} (${(uGrowth * 100).toFixed(1)}%) against revenue growth of ${(rGrowth * 100).toFixed(1)}%: a ${gapPp.toFixed(0)}-point gap against a ${threshold.toFixed(0)}-point threshold (${latest.period_label} against ${prior.period_label}).`;
  return gapPp > threshold ? { status: "hit", evidence: [{ page: null, text }], reason: "Unbilled revenue grew well ahead of revenue." } : { status: "clear", evidence: [{ page: null, text }], reason: "Unbilled revenue did not grow ahead of revenue by more than the threshold." };
}

function inconsistencyTest(notes: AnnualNotes | null, latest: FinancialStatement | null): Pick<EwsItem, "status" | "evidence" | "reason"> {
  if (!notes) return { status: "not_read", evidence: [], reason: "No annual-report notes are on file for this company." };
  const flagged = notes.findings.filter((f) => f.id.startsWith("ratio_check_"));
  if (flagged.length) return { status: "hit", evidence: flagged.map((f) => ({ page: f.page, text: f.detail })), reason: "A ratio the company discloses does not match the same ratio computed from its statements." };
  const checkable = notes.ratios.filter((r) => (r.id === "current_ratio" || r.id === "net_margin") && (r.basis == null || !latest || r.basis === latest.basis));
  if (checkable.length === 0) return { status: "not_read", evidence: [], reason: "Neither the current ratio nor the net margin was read from the company's own ratio table, so there is nothing to cross-check." };
  if (!latest) return { status: "not_read", evidence: [], reason: "No statement is on file to compute the ratios from." };
  const needs = checkable.some((r) => (r.id === "current_ratio" ? latest.current_assets != null && latest.current_liabilities != null : true));
  if (!needs) return { status: "not_read", evidence: [], reason: "The statement on file lacks the current assets or liabilities needed to compute the current ratio." };
  return { status: "clear", evidence: checkable.map((r) => ({ page: r.page, text: `The company's disclosed ${r.id === "current_ratio" ? "current ratio" : "net margin"} agrees with the statements.` })), reason: "The two cross-checks that exist were run and agree." };
}

function borrowingTest(latest: FinancialStatement | null, prior: FinancialStatement | null): Pick<EwsItem, "status" | "evidence" | "reason"> {
  if (!latest || !prior) return { status: "not_read", evidence: [], reason: "Two consecutive years on the same basis are needed and are not on file." };
  const d1 = latest.total_debt, d0 = prior.total_debt, cash = latest.cash_and_equivalents;
  if (d1 == null || d0 == null || cash == null) return { status: "not_read", evidence: [], reason: "Total borrowings or cash and equivalents are not on file for both years." };
  if (d0 <= 0) return { status: "clear", evidence: [], reason: "The company had no borrowings the year before." };
  const growth = (d1 - d0) / d0, ratio = d1 > 0 ? cash / d1 : Infinity;
  const text = `Borrowings ${d0} to ${d1} (${(growth * 100).toFixed(1)}%), cash and equivalents ${cash} (${Number.isFinite(ratio) ? (ratio * 100).toFixed(0) : "all"}% of year-end borrowings), ${latest.period_label} against ${prior.period_label}.`;
  return growth >= EWS_THRESHOLDS.debt_growth && ratio >= EWS_THRESHOLDS.cash_to_debt
    ? { status: "hit", evidence: [{ page: null, text }], reason: "Borrowings rose while cash stayed large against them." }
    : { status: "clear", evidence: [{ page: null, text }], reason: "Borrowings did not rise while cash was large against them." };
}

const NOT_READABLE_REASON: Record<string, string> = {
  roc_liabilities: "Cannot be read from an annual report: it needs the Registrar of Companies charge register.",
  poor_disclosure: "Cannot be read from a filing: it is about what was left out.",
  promoter_pledge: "Cannot be read from an annual report: it needs the shareholding pattern and pledge disclosures.",
};

/** The checklist for one company, from the latest annual year that has notes (or, failing that, the latest annual year on file). */
export function buildEws(workspace: Workspace, statements: FinancialStatement[]): EwsChecklist {
  const fy = statements.filter((s) => s.workspace_id === workspace.id && s.period_type === "FY").sort((a, b) => b.period_end_date.localeCompare(a.period_end_date));
  const withNotes = fy.find((s) => parseNotes(s.annual_report_notes));
  const withChecks = fy.find((s) => parseChecks(s.annual_report_checks));
  const notes = withNotes ? parseNotes(withNotes.annual_report_notes) : null;
  const checks = withChecks ? parseChecks(withChecks.annual_report_checks) : null;
  const preferred = fy.filter((s) => s.basis === workspace.comparison_basis);
  const pool = preferred.length ? preferred : fy;
  const latest = (withNotes && pool.find((s) => s.period_end_date === withNotes.period_end_date && s.basis === withNotes.basis)) ?? pool[0] ?? null;
  const prior = latest ? sameBasisPrior(pool, latest) : null;

  const items: EwsItem[] = [...RBI_LIST, ...ALSO_READ].map((d) => {
    let r: Pick<EwsItem, "status" | "evidence" | "reason">;
    if (d.id in NOT_READABLE_REASON) r = { status: "not_readable", evidence: [], reason: NOT_READABLE_REASON[d.id] };
    else if (d.id in CARO_BY_ITEM) r = caroTest(d, notes);
    else if (d.id === "opinion" || d.id === "going_concern") r = opinionTest(d, checks);
    else if (d.id === "unbilled_revenue") r = unbilledTest(workspace, latest, prior);
    else if (d.id === "inconsistency") r = inconsistencyTest(notes, latest);
    else r = borrowingTest(latest, prior);
    const { status: _s, evidence: _e, reason: _r, ...rest } = d;
    return { ...rest, ...r };
  });

  const summary: Record<EwsStatus, number> = { hit: 0, clear: 0, not_read: 0, not_readable: 0 };
  for (const i of items) summary[i.status]++;
  return { period_label: latest?.period_label ?? null, basis: latest?.basis ?? null, items, summary, empty: !latest };
}

export const STATUS_LABEL: Record<EwsStatus, string> = { hit: "Hit", clear: "Clear", not_read: "Not read", not_readable: "Not readable from filings" };
