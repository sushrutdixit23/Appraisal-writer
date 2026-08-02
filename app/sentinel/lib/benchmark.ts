// Sentinel — Benchmark Engine. Formalizes "named peer + industry
// context" as a reusable, metric-agnostic piece so any page that shows
// a company's number next to its peers (KPI Dashboard, Financial
// Statements, Deep Analysis, investigation narratives) draws from the
// same logic instead of each place recomputing its own closest-peer or
// average by hand.
//
// findClosestPeer below is the exact same logic that used to live
// inline in the narrative API route — moved, not changed, so
// investigation generation's peer selection doesn't shift.

import type { PeerRow } from "./types";

export type BenchmarkDirection = "higher_is_better" | "lower_is_better";

export type Benchmark = {
  metric: string;
  direction: BenchmarkDirection;
  subjectValue: number | null;
  closestPeer: { company_name: string; value: number | null } | null;
  industryAverage: number | null;
  industryLeader: { company_name: string; value: number } | null;
  /** 0-100, direction-aware: share of the peer set (excluding the
   * subject itself) the subject is at or ahead of. Null if fewer than
   * two peers have a value for this metric. */
  percentile: number | null;
  /** subjectValue - closestPeer.value, raw units (not direction-flipped). */
  gapToClosestPeer: number | null;
  gapToLeader: number | null;
  /** Peers (including the subject) with a non-null value for this metric. */
  sampleSize: number;
};

/** Extract one metric's value off a PeerRow. The three raw absolute
 * fields (revenue_cr, pat_cr, pbt_cr) live as top-level PeerRow
 * properties; every other metric (margins, YoY, liquidity/leverage
 * ratios) lives in the row's `ratios` map under the same id used
 * throughout engine.ts / config.ts. */
export function getMetricValue(row: PeerRow, metric: string): number | null {
  if (metric === "revenue_cr") return row.revenue_cr;
  if (metric === "pat_cr") return row.pat_cr;
  if (metric === "pbt_cr") return row.pbt_cr;
  return row.ratios[metric] ?? null;
}

/** The single peer most comparable to the subject by revenue scale -
 * closest absolute revenue, excluding the subject itself. Real advisory
 * work (GDT, TSR benchmarking decks) names one specific peer rather than
 * only citing a sector average - "you vs your closest comp" is a
 * sharper, more defensible comparison than "you vs the mean of five
 * companies at very different scales". Returns null if there's no other
 * peer in the row set. */
export function findClosestPeer(rows: PeerRow[], subjectWorkspaceId: string): PeerRow | null {
  const subject = rows.find((r) => r.workspace_id === subjectWorkspaceId);
  if (!subject) return null;
  const others = rows.filter((r) => r.workspace_id !== subjectWorkspaceId);
  if (others.length === 0) return null;
  others.sort(
    (a, b) =>
      Math.abs(a.revenue_cr - subject.revenue_cr) - Math.abs(b.revenue_cr - subject.revenue_cr)
  );
  return others[0];
}

/** Full benchmark context for one metric: the named closest peer, the
 * industry average and leader across the whole row set, and the
 * subject's percentile rank. `direction` controls what "leader" and
 * "percentile" mean for this metric - most margins/growth ratios are
 * higher_is_better; days-outstanding and leverage ratios
 * (inventory_days, receivable_days, payable_days, debt_to_equity) are
 * lower_is_better. Callers pass the right direction per metric rather
 * than the engine guessing from the metric name string. */
export function getBenchmark(
  rows: PeerRow[],
  subjectWorkspaceId: string,
  metric: string,
  direction: BenchmarkDirection = "higher_is_better"
): Benchmark {
  const subjectRow = rows.find((r) => r.workspace_id === subjectWorkspaceId) ?? null;
  const subjectValue = subjectRow ? getMetricValue(subjectRow, metric) : null;

  const valued = rows
    .map((r) => ({ row: r, value: getMetricValue(r, metric) }))
    .filter((x): x is { row: PeerRow; value: number } => x.value != null);

  const closestPeerRow = findClosestPeer(rows, subjectWorkspaceId);
  const closestPeer = closestPeerRow
    ? { company_name: closestPeerRow.company_name, value: getMetricValue(closestPeerRow, metric) }
    : null;

  const industryAverage =
    valued.length > 0 ? valued.reduce((sum, x) => sum + x.value, 0) / valued.length : null;

  let industryLeader: Benchmark["industryLeader"] = null;
  if (valued.length > 0) {
    const best = valued.reduce((a, b) => {
      const aBetter = direction === "higher_is_better" ? a.value >= b.value : a.value <= b.value;
      return aBetter ? a : b;
    });
    industryLeader = { company_name: best.row.company_name, value: best.value };
  }

  let percentile: number | null = null;
  if (subjectValue != null && valued.length > 1) {
    const peers = valued.filter((x) => x.row.workspace_id !== subjectWorkspaceId);
    const atOrBehindCount = peers.filter((x) =>
      direction === "higher_is_better" ? subjectValue >= x.value : subjectValue <= x.value
    ).length;
    percentile = (atOrBehindCount / peers.length) * 100;
  }

  const gapToClosestPeer =
    subjectValue != null && closestPeer?.value != null ? subjectValue - closestPeer.value : null;
  const gapToLeader =
    subjectValue != null && industryLeader != null ? subjectValue - industryLeader.value : null;

  return {
    metric,
    direction,
    subjectValue,
    closestPeer,
    industryAverage,
    industryLeader,
    percentile,
    gapToClosestPeer,
    gapToLeader,
    sampleSize: valued.length,
  };
}
