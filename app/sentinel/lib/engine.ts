// Sentinel — financial engine, ported from src/sentinel/engine/ (Python).
// Pure functions, no I/O: importable identically from client pages and
// server API routes.

import { COMPANY_CONFIG, SECTOR_CONFIG } from "./config";
import type { FinancialStatement, PeerRow } from "./types";

/** Same company, same period type, period ending exactly one year earlier
 * (year - 1, same month). Deliberately strict — a quarterly statement never
 * silently pairs against a full-year one. Mirrors _find_prior_year. */
export function findPriorYear(
  stmt: FinancialStatement,
  all: FinancialStatement[]
): FinancialStatement | null {
  const [y, m] = stmt.period_end_date.split("-").map(Number);
  for (const other of all) {
    const [oy, om] = other.period_end_date.split("-").map(Number);
    if (
      other.company_id === stmt.company_id &&
      other.period_type === stmt.period_type &&
      oy === y - 1 &&
      om === m
    ) {
      return other;
    }
  }
  return null;
}

/** Evaluate every sector-configured ratio for one statement. A ratio that
 * can't be computed (missing field, no prior year, zero denominator)
 * resolves to null rather than throwing — a peer table with a gap beats a
 * pipeline that crashes on one missing field. */
export function computeRatios(
  stmt: FinancialStatement,
  prior: FinancialStatement | null
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const ratio of SECTOR_CONFIG.derived_ratios) {
    try {
      const v = ratio.compute(stmt, prior);
      out[ratio.id] = v == null || Number.isNaN(v) ? null : v;
    } catch {
      out[ratio.id] = null;
    }
  }
  return out;
}

/** Build the peer comparison table: each company's MOST RECENT period of
 * the given type — not every FY record, which would include prior-year
 * comparatives as their own rows. Rows are basis-labeled, never silently
 * normalized: basis_caveat flags any company whose extract doesn't match
 * the sector's comparison standard. Sorted by revenue, descending. */
export function buildPeerTable(
  statements: FinancialStatement[],
  periodType: string = "FY"
): PeerRow[] {
  const comparisonBasis = new Map(
    COMPANY_CONFIG.companies.map((c) => [c.id, c.comparison_basis])
  );
  const subjectCompany =
    COMPANY_CONFIG.companies.find((c) => c.is_subject)?.id ?? null;

  const candidates = statements.filter((s) => s.period_type === periodType);
  const latestByCompany = new Map<string, FinancialStatement>();
  for (const s of candidates) {
    const current = latestByCompany.get(s.company_id);
    if (!current || s.period_end_date > current.period_end_date) {
      latestByCompany.set(s.company_id, s);
    }
  }

  const rows: PeerRow[] = [];
  for (const stmt of latestByCompany.values()) {
    const prior = findPriorYear(stmt, statements);
    const ratios = computeRatios(stmt, prior);

    let basisCaveat: string | null = null;
    const expected = comparisonBasis.get(stmt.company_id);
    if (expected && stmt.basis !== expected) {
      basisCaveat = `using ${stmt.basis} — ${expected} not available in current extract`;
    }

    rows.push({
      company_id: stmt.company_id,
      company_name: stmt.company_name,
      is_subject: stmt.company_id === subjectCompany,
      period_label: stmt.period_label,
      basis: stmt.basis,
      basis_caveat: basisCaveat,
      revenue_cr: stmt.revenue_from_operations,
      pat_cr: stmt.profit_after_tax,
      pbt_cr: stmt.profit_before_tax,
      exceptional_items_cr: stmt.exceptional_items ?? 0,
      has_prior_year: prior != null,
      ratios,
    });
  }

  rows.sort((a, b) => b.revenue_cr - a.revenue_cr);
  return rows;
}

/** One-line warning if the table mixes standalone and consolidated bases —
 * absolute figures are not comparable across rows in that case. Mirrors
 * mixed_basis_warning. */
export function mixedBasisWarning(rows: PeerRow[]): string | null {
  const bases = new Set(rows.map((r) => r.basis));
  if (bases.size <= 1) return null;
  const flagged = rows
    .filter((r) => r.basis_caveat != null)
    .map((r) => r.company_name);
  return (
    `Mixed basis in this table (${[...bases].sort().join(", ")}). ` +
    `Absolute figures (revenue, PAT) are not directly comparable across rows. ` +
    `Margin ratios are more comparable but not guaranteed equivalent. ` +
    `Affected: ${flagged.join(", ")}.`
  );
}
