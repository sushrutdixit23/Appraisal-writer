// Sentinel - the evidence blocks the narrative prompt is built from that a flag value alone cannot give the model:
// how the flagged metric moved from last year, whether receivables outgrew revenue, which basis each peer figure is
// on, and whether the peers' receivables are even defined the same way. Pure: statements in, prompt text out.
// Everything here is computed in code and handed to the model as fact, so it never has to guess a trend.

import { computeRatios } from "./engine";
import type { FinancialStatement, PeerRow } from "./types";

const isRatioMetric = (metric: string) => metric.includes("yoy") || metric.includes("margin") || metric.includes("pct");

/** One metric value as the prompt shows it: growth and margins as signed percentages, everything else as a plain number. */
export function formatMetricValue(metric: string, v: number): string {
  return isRatioMetric(metric)
    ? `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`
    : v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

/** Receivables growth against revenue growth, year on year. A rising receivable-days figure is only a collections
 * story when receivables outgrew the sales they came from; this is that comparison, stated outright.
 * Null without a like-for-like prior year or a positive base on either line. */
export function receivablesGrowthGap(stmt: FinancialStatement, prior: FinancialStatement | null): { receivables: number; revenue: number; gapPoints: number } | null {
  if (!prior) return null;
  const r1 = stmt.trade_receivables, r0 = prior.trade_receivables;
  const s1 = stmt.revenue_from_operations, s0 = prior.revenue_from_operations;
  if (r1 == null || r0 == null || r0 <= 0 || s0 <= 0) return null;
  const receivables = r1 / r0 - 1;
  const revenue = s1 / s0 - 1;
  return { receivables, revenue, gapPoints: (receivables - revenue) * 100 };
}

/** Last year's value of each flagged metric next to this year's, plus the receivables-versus-revenue comparison when
 * the receivable days are in play. Empty string when there is no prior year, so the prompt says nothing rather than
 * describing an absence. `priorOfPrior` lets last year's own growth ratios be computed. */
export function trendBlock(
  stmt: FinancialStatement,
  prior: FinancialStatement | null,
  priorOfPrior: FinancialStatement | null,
  sector: string,
  metrics: string[]
): string {
  if (!prior) return "";
  const now = computeRatios(stmt, prior, sector);
  const before = computeRatios(prior, priorOfPrior, sector);
  const lines: string[] = [];
  for (const metric of new Set(metrics)) {
    const a = now[metric], b = before[metric];
    if (a == null || b == null) continue;
    lines.push(`  ${metric}: ${formatMetricValue(metric, b)} in ${prior.period_label} -> ${formatMetricValue(metric, a)} in ${stmt.period_label}`);
  }
  const gap = metrics.includes("receivable_days") || metrics.includes("cash_conversion_cycle") ? receivablesGrowthGap(stmt, prior) : null;
  if (gap) {
    lines.push(
      `  Trade receivables ${pct(gap.receivables)} against revenue ${pct(gap.revenue)} year on year ` +
        `(receivables ${gap.gapPoints >= 0 ? "ahead of" : "behind"} revenue by ${Math.abs(gap.gapPoints).toFixed(1)} points)`
    );
  }
  if (lines.length === 0) return "";
  return `\n\nHow the flagged measures moved from the prior year (computed from the filings, same basis):\n${lines.join("\n")}`;
}

/** Whether the peers' receivables look like the same measure. Trade receivables is billed receivables for some
 * companies and billed plus unbilled revenue for others, and the filing rarely says which one a row holds. What
 * the data CAN show is which peers have an unbilled line on file at all: when only some do, a receivable-days gap
 * between them may be a definition gap. Null when every peer (or none) carries the line, or only one peer has
 * receivables data. */
export function receivablesDefinitionNote(rows: PeerRow[]): string | null {
  const withDays = rows.filter((r) => r.ratios["receivable_days"] != null);
  if (withDays.length < 2) return null;
  const withUnbilled = withDays.filter((r) => r.unbilled_revenue_cr != null).map((r) => r.company_name);
  const without = withDays.filter((r) => r.unbilled_revenue_cr == null).map((r) => r.company_name);
  if (withUnbilled.length === 0 || without.length === 0) return null;
  return (
    `Receivable days may not be like-for-like across these peers: an unbilled-revenue line is on file for ${withUnbilled.join(", ")} ` +
    `but not for ${without.join(", ")}. Some companies include unbilled revenue in trade receivables and some leave it out, so a ` +
    `difference in receivable days between these companies can be a definition difference rather than slower collections.`
  );
}

/** Every peer's basis, spelled out, with a plain instruction when they differ: absolute figures from a standalone row and
 * a consolidated row describe different perimeters. Null when every row is on the same basis. */
export function basisNote(rows: PeerRow[]): string | null {
  const bases = new Set(rows.map((r) => r.basis));
  if (bases.size <= 1) return null;
  const list = rows.map((r) => `${r.company_name} (${r.basis})`).join(", ");
  return (
    `The peers are not all on the same basis: ${list}. Standalone and consolidated figures cover different perimeters, ` +
    `so compare ratios, not absolute amounts, and name the basis whenever you cite a peer's number.`
  );
}
