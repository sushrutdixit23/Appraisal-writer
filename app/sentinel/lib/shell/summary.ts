// Sentinel shell - one project's card: how many periods, the latest year, its health, its open findings. Pure.

import { findPriorYear } from "../engine";
import { computeHealthScore, type HealthScore, type HealthStatus } from "../health";
import type { FinancialStatement, Workspace } from "../types";

export type ProjectSummary = {
  periods: number;
  latest: FinancialStatement | null;
  prior: FinancialStatement | null;
  health: HealthScore | null;
  pending: number;
  approved: number;
};

/** The latest annual statement of a company; when two bases share the latest date, its own basis wins. */
export function latestAnnual(ws: Pick<Workspace, "id" | "comparison_basis">, statements: FinancialStatement[]): FinancialStatement | null {
  const own = statements.filter((s) => s.workspace_id === ws.id && s.period_type === "FY");
  if (own.length === 0) return null;
  const newest = own.reduce((m, s) => (s.period_end_date > m ? s.period_end_date : m), "");
  const tied = own.filter((s) => s.period_end_date === newest);
  return tied.find((s) => s.basis === ws.comparison_basis) ?? tied[0];
}

export function summarise(
  ws: Pick<Workspace, "id" | "sector" | "currency_unit" | "comparison_basis">,
  statements: FinancialStatement[],
  investigations: { workspace_id: string; status: string }[]
): ProjectSummary {
  const latest = latestAnnual(ws, statements);
  const prior = latest ? findPriorYear(latest, statements) : null;
  let health: HealthScore | null = null;
  if (latest) {
    try {
      health = computeHealthScore(latest, prior, ws.sector, ws.currency_unit);
    } catch {
      health = null; // a sector with no configuration: show the numbers, not a grade
    }
  }
  const mine = investigations.filter((i) => i.workspace_id === ws.id);
  return {
    periods: statements.filter((s) => s.workspace_id === ws.id).length,
    latest,
    prior,
    health,
    pending: mine.filter((i) => i.status === "pending").length,
    approved: mine.filter((i) => i.status === "approved" || i.status === "edited").length,
  };
}

export const HEALTH_STYLE: Record<HealthStatus, { color: string; label: string }> = {
  healthy: { color: "#2F5233", label: "Healthy" },
  watch: { color: "#8A6416", label: "Watch" },
  concern: { color: "#9A4A1F", label: "Concern" },
  critical: { color: "#8C2A2A", label: "Critical" },
  no_data: { color: "#6B6660", label: "No data" },
};
