// Sentinel — financial engine, rebuilt around workspace_id. The one real
// correctness fix in this rebuild: `is_subject` is no longer a static
// flag anywhere (it used to live in COMPANY_CONFIG, hardcoding Apollo
// Tyres as permanently "the" subject). It's now a parameter to
// buildPeerTable — whichever workspace you're viewing from is the
// subject, and every other company in that sector becomes a peer. Open
// JK Tyre's workspace and JK Tyre is the subject; Apollo becomes a peer.

import { getSectorConfig } from "./config";
import type { FinancialStatement, PeerRow, Workspace } from "./types";

/** Same workspace, same period type, period ending exactly one year
 * earlier (year - 1, same month). Deliberately strict — a quarterly
 * statement never silently pairs against a full-year one. */
export function findPriorYear(
  stmt: FinancialStatement,
  all: FinancialStatement[]
): FinancialStatement | null {
  const [y, m] = stmt.period_end_date.split("-").map(Number);
  for (const other of all) {
    const [oy, om] = other.period_end_date.split("-").map(Number);
    if (
      other.workspace_id === stmt.workspace_id &&
      other.period_type === stmt.period_type &&
      oy === y - 1 &&
      om === m
    ) {
      return other;
    }
  }
  return null;
}

/** Evaluate every sector-configured ratio for one statement. A ratio
 * that can't be computed (missing field, no prior year, zero
 * denominator) resolves to null rather than throwing. */
export function computeRatios(
  stmt: FinancialStatement,
  prior: FinancialStatement | null,
  sector: string
): Record<string, number | null> {
  const cfg = getSectorConfig(sector);
  const out: Record<string, number | null> = {};
  for (const ratio of cfg.derived_ratios) {
    try {
      const v = ratio.compute(stmt, prior);
      out[ratio.id] = v == null || Number.isNaN(v) ? null : v;
    } catch {
      out[ratio.id] = null;
    }
  }
  return out;
}

/** Build the peer comparison table for one workspace's view: the peer
 * set is every OTHER workspace in the same sector, plus the subject
 * itself, each represented by its most recent period of the given type.
 * Rows are basis-labeled against each workspace's own comparison_basis,
 * never silently normalized. Sorted by revenue, descending. */
export function buildPeerTable(
  workspaces: Workspace[],
  statements: FinancialStatement[],
  subjectWorkspaceId: string,
  periodType: string = "FY"
): PeerRow[] {
  const subject = workspaces.find((w) => w.id === subjectWorkspaceId);
  if (!subject) return [];

  const sectorPeers = workspaces.filter((w) => w.sector === subject.sector);
  const wsById = new Map(sectorPeers.map((w) => [w.id, w]));

  const candidates = statements.filter(
    (s) => s.period_type === periodType && wsById.has(s.workspace_id)
  );
  const latestByWorkspace = new Map<string, FinancialStatement>();
  for (const s of candidates) {
    const current = latestByWorkspace.get(s.workspace_id);
    if (!current || s.period_end_date > current.period_end_date) {
      latestByWorkspace.set(s.workspace_id, s);
    }
  }

  const rows: PeerRow[] = [];
  for (const stmt of latestByWorkspace.values()) {
    const ws = wsById.get(stmt.workspace_id)!;
    const prior = findPriorYear(stmt, statements);
    const ratios = computeRatios(stmt, prior, ws.sector);

    let basisCaveat: string | null = null;
    if (stmt.basis !== ws.comparison_basis) {
      basisCaveat = `using ${stmt.basis} \u2014 ${ws.comparison_basis} not available in current extract`;
    }

    rows.push({
      workspace_id: ws.id,
      company_name: ws.company_name,
      is_subject: ws.id === subjectWorkspaceId,
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

/** One-line warning if the table mixes standalone and consolidated
 * bases — absolute figures are not comparable across rows in that case. */
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
