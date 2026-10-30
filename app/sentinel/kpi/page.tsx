"use client";
export const dynamic = "force-dynamic";

// Sentinel - KPI Dashboard, redesigned. The Intelligence Layer per the
// vision doc: computed metrics an analyst works with directly, not
// narrative.
//
// Redesign notes (why this looks different from before):
// - The old layout stacked 7-8 independently bordered/rounded boxes of
//   equal visual weight (Business Health, five separate chart cards,
//   Peer Ranking, Quick Summary, Capital Structure) with no hierarchy
//   between "this is the verdict" and "this is supporting detail."
// - This version leads with an unboxed masthead - company name, overall
//   health, and the Quick Financial Summary paragraph together, the way
//   a real financial report leads with an opinion before its schedules
//   - then groups what follows into five clearly bordered "schedules"
//   (Business Health, Key Figures, Peer Standing, Trend, Capital
//   Structure) instead of eight arbitrary boxes.
// - Peer Ranking's metric selector previously only drove the rank/
//   percentile numbers; the three chart cards below it were hardcoded
//   to Revenue/EBITDA/PAT regardless of what was selected. Peer
//   Standing now shares one selector across both the ranking stats and
//   the bar chart, and covers all 10 ranking metrics instead of 3.
// - Removed tracked-out uppercase section labels and middle-dot-joined
//   meta strings throughout in favor of plain sentence-case headings -
//   decorative conventions, not information.
//
// The charts are the shared kit in ../lib/viz (see docs/sentinel-viz.md): key figures carry their change on the year
// before and their shape over the years; Peer standing ranks best first against the peer average; Trend is columns
// for amounts (anchored on zero) and a line for margins; Capital structure is one split bar. A company with a single
// period on file legitimately shows a single point.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { sortWorkspaces, workspaceOptionLabel } from "../lib/access";
import { ordinal } from "../lib/format";
import { useDisplayUnit } from "../lib/displayUnit";
import type { DisplayFormat } from "../lib/displayUnitCore";
import { useSelectedWorkspace } from "../lib/useSelectedWorkspace";
import { ColumnChart } from "../lib/viz/ColumnChart";
import { LineChart } from "../lib/viz/LineChart";
import { RankChart } from "../lib/viz/RankChart";
import { SeverityMeter } from "../lib/viz/SeverityMeter";
import { SplitBar } from "../lib/viz/SplitBar";
import { makeDelta, type TileDelta } from "../lib/viz/delta";
import { StatTile } from "../lib/viz/StatTile";
import type { MetricKind } from "../lib/viz/format";
import { VIZ } from "../lib/viz/tokens";
import { buildPeerTable, buildTimeSeries, computeRatios, findPriorYear } from "../lib/engine";
import { getBenchmark, getMetricValue, type Benchmark } from "../lib/benchmark";
import { altmanZone, BENEISH_THRESHOLD, piotroskiF } from "../lib/ratios";
import { bookValuePerShareRupees, epsRupees } from "../lib/valuation";
import { croreFactor } from "../lib/units";
import { computeHealthScore, type HealthCategory, type HealthScore, type HealthStatus } from "../lib/health";
import { SERIF, T } from "../lib/theme";
import type { FinancialStatement, PeerRow, Workspace } from "../lib/types";

const pct = (v: number | null) => (v == null ? "-" : `${(v * 100).toFixed(1)}%`);
const num = (v: number | null) =>
  v == null ? "-" : v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const days = (v: number | null) => (v == null ? "-" : `${v.toFixed(0)}d`);
const ratioX = (v: number | null) => (v == null ? "-" : `${v.toFixed(2)}x`);
const rupees = (v: number | null) => (v == null ? "-" : `\u20b9${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

function formatBenchmarkNote(b: Benchmark | null, unit: "pp" | "cr" | "x" | "d", du: DisplayFormat): string | null {
  if (!b || !b.closestPeer || b.gapToClosestPeer == null) return null;
  const sign = b.gapToClosestPeer >= 0 ? "+" : "";
  const magnitude =
    unit === "pp"
      ? `${(b.gapToClosestPeer * 100).toFixed(1)}pp`
      : unit === "x"
      ? `${b.gapToClosestPeer.toFixed(2)}x`
      : unit === "d"
      ? `${b.gapToClosestPeer.toFixed(0)}d`
      : `${du.fromCrore(b.gapToClosestPeer).toLocaleString("en-IN", { maximumFractionDigits: 0 })} ${du.crossShort}`.trim();
  return `vs ${b.closestPeer.company_name}: ${sign}${magnitude}`;
}

function formatIndustryLine(b: Benchmark | null, unit: "pp" | "cr" | "x" | "d", du: DisplayFormat): string | null {
  if (!b || b.industryAverage == null || !b.industryLeader) return null;
  const fmt = (v: number) =>
    unit === "pp"
      ? `${(v * 100).toFixed(1)}%`
      : unit === "x"
      ? `${v.toFixed(2)}x`
      : unit === "d"
      ? `${v.toFixed(0)}d`
      : du.fromCrore(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return `Industry average ${fmt(b.industryAverage)}, led by ${b.industryLeader.company_name} at ${fmt(
    b.industryLeader.value
  )}`;
}

function formatByUnit(v: number, unit: "pp" | "cr" | "x" | "d", du: DisplayFormat): string {
  if (unit === "pp") return `${(v * 100).toFixed(1)}%`;
  if (unit === "x") return `${v.toFixed(2)}x`;
  if (unit === "d") return `${v.toFixed(0)}d`;
  return du.fromCrore(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

// Computed directly from peerRows (not approximated from percentile) so
// the displayed rank is always an exact "N of M" against the real
// values on file, using the same null-safe metric extraction
// getBenchmark itself uses via getMetricValue.
function computeRank(
  rows: PeerRow[],
  subjectId: string,
  metric: string,
  direction: "higher_is_better" | "lower_is_better"
): { rank: number; total: number } | null {
  const values = rows
    .map((r) => ({ id: r.workspace_id, value: getMetricValue(r, metric) }))
    .filter((x): x is { id: string; value: number } => x.value != null);
  const subject = values.find((x) => x.id === subjectId);
  if (!subject) return null;
  const better = values.filter((x) =>
    direction === "higher_is_better" ? x.value > subject.value : x.value < subject.value
  ).length;
  return { rank: better + 1, total: values.length };
}

/** Peer rows for the ranking chart, with ids so a row keeps its identity when the measure changes. */
function buildRankRows(rows: PeerRow[], metric: string, convert: (v: number) => number): { id: string; label: string; value: number }[] {
  return rows
    .map((r) => ({ id: r.workspace_id, label: r.company_name, value: getMetricValue(r, metric) }))
    .filter((d): d is { id: string; label: string; value: number } => d.value != null)
    .map((d) => ({ ...d, value: convert(d.value) }));
}

const KIND_OF_UNIT: Record<"pp" | "cr" | "x" | "d", MetricKind> = { pp: "percent", cr: "amount", x: "multiple", d: "days" };

// Quick Financial Summary - deterministic, not AI prose. Stitches
// together the already-computed Health Engine detail sentences for the
// categories that matter most (same convention as everywhere else in
// Sentinel: reuse what is already computed rather than generate new
// text), so this can never say something the Business Health section
// itself would not also support.
function buildQuickSummary(healthScore: HealthScore): string | null {
  const priorityOrder = ["growth", "profitability", "liquidity", "leverage", "working_capital"];
  const sentences = priorityOrder
    .map((key) => healthScore.categories.find((c) => c.key === key))
    .filter((c): c is HealthCategory => c != null && c.detail != null)
    .slice(0, 3)
    .map((c) => {
      const d = c.detail as string;
      return d.charAt(0).toUpperCase() + d.slice(1);
    });
  if (sentences.length === 0) return null;
  return sentences.join(". ") + ".";
}

const PEER_RANKING_METRICS: {
  label: string;
  metric: string;
  direction: "higher_is_better" | "lower_is_better";
  unit: "pp" | "cr" | "x" | "d";
}[] = [
  { label: "Revenue", metric: "revenue_cr", direction: "higher_is_better", unit: "cr" },
  { label: "EBITDA margin", metric: "ebitda_margin", direction: "higher_is_better", unit: "pp" },
  { label: "PAT margin", metric: "pat_margin", direction: "higher_is_better", unit: "pp" },
  { label: "Revenue YoY", metric: "yoy_revenue_growth", direction: "higher_is_better", unit: "pp" },
  { label: "PAT YoY", metric: "yoy_pat_growth", direction: "higher_is_better", unit: "pp" },
  { label: "Current ratio", metric: "current_ratio", direction: "higher_is_better", unit: "x" },
  { label: "Debt-to-equity", metric: "debt_to_equity", direction: "lower_is_better", unit: "x" },
  { label: "Inventory days", metric: "inventory_days", direction: "lower_is_better", unit: "d" },
  { label: "Receivable days", metric: "receivable_days", direction: "lower_is_better", unit: "d" },
  { label: "Cash conversion cycle", metric: "cash_conversion_cycle", direction: "lower_is_better", unit: "d" },
  { label: "ROE", metric: "roe", direction: "higher_is_better", unit: "pp" },
  { label: "ROCE", metric: "roce", direction: "higher_is_better", unit: "pp" },
  { label: "Interest cover", metric: "interest_cover", direction: "higher_is_better", unit: "x" },
  { label: "Net debt / EBITDA", metric: "net_debt_to_ebitda", direction: "lower_is_better", unit: "x" },
  { label: "Cash from operations / PAT", metric: "cfo_to_pat", direction: "higher_is_better", unit: "x" },
  { label: "Free cash flow margin", metric: "fcf_margin", direction: "higher_is_better", unit: "pp" },
  { label: "Asset turnover", metric: "asset_turnover", direction: "higher_is_better", unit: "x" },
  { label: "P/E", metric: "pe_ratio", direction: "lower_is_better", unit: "x" },
  { label: "Price / book", metric: "pb_ratio", direction: "lower_is_better", unit: "x" },
  { label: "Free cash flow yield", metric: "fcf_yield", direction: "higher_is_better", unit: "pp" },
  { label: "EV/EBITDA", metric: "ev_ebitda", direction: "lower_is_better", unit: "x" },
  { label: "EV/Sales", metric: "ev_sales", direction: "lower_is_better", unit: "x" },
];

const HEALTH_COLORS: Record<HealthStatus, { text: string; statusLabel: string }> = {
  healthy: { text: T.green, statusLabel: "Healthy" },
  watch: { text: T.ochre, statusLabel: "Watch" },
  concern: { text: T.concern, statusLabel: "Concern" },
  critical: { text: T.oxblood, statusLabel: "Critical" },
  no_data: { text: T.inkSoft, statusLabel: "No data" },
};

const selectStyle: React.CSSProperties = {
  fontFamily: "inherit",
  fontSize: "0.85rem",
  padding: "0.4rem 0.6rem",
  border: `1px solid ${T.rule}`,
  borderRadius: 3,
  background: T.card,
  color: T.ink,
};

const btnQuiet: React.CSSProperties = {
  fontFamily: "inherit",
  fontSize: "0.8rem",
  padding: "0.4rem 0.9rem",
  border: `1px solid ${T.rule}`,
  borderRadius: 3,
  background: "transparent",
  color: T.inkSoft,
  cursor: "pointer",
};

// A schedule: the one repeated bordered-section treatment in this
// redesign, used deliberately for the five things that really are
// distinct exhibits (Business Health, Key Figures, Peer Standing,
// Trend, Capital Structure) - not applied to every element on the
// page, which was the old pattern.
function Schedule({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string | null;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: T.card,
        border: `1px solid ${T.rule}`,
        borderRadius: 3,
        padding: "1.5rem 1.7rem",
        marginBottom: "1.5rem",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: subtitle ? "0.3rem" : "1.1rem",
        }}
      >
        <h3 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "1.05rem", color: T.ink, margin: 0 }}>
          {title}
        </h3>
        {right}
      </div>
      {subtitle && <p style={{ fontSize: "0.78rem", color: T.inkSoft, margin: "0 0 1.1rem 0" }}>{subtitle}</p>}
      {children}
    </section>
  );
}

const HEALTH_LEVEL: Record<HealthStatus, 0 | 1 | 2 | 3 | 4> = { healthy: 4, watch: 3, concern: 2, critical: 1, no_data: 0 };

function HealthRow({ category, isLast }: { category: HealthCategory; isLast: boolean }) {
  const colors = HEALTH_COLORS[category.status];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", columnGap: "1.2rem", alignItems: "center", padding: "0.7rem 0", borderBottom: isLast ? "none" : `1px solid ${T.rule}` }}>
      <div style={{ minWidth: 0 }}>
        <span style={{ fontSize: "0.9rem", color: T.ink, fontWeight: 500 }}>{category.label}</span>
        <p style={{ fontSize: "0.76rem", color: T.inkSoft, margin: "0.15rem 0 0 0", lineHeight: 1.45 }}>
          {category.detail ?? (category.status === "no_data" ? "Needs figures this company does not have on file yet." : "")}
        </p>
      </div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: "0.65rem" }}>
        <SeverityMeter level={HEALTH_LEVEL[category.status]} color={colors.text} label={`${category.label}: ${colors.statusLabel}`} />
        <span style={{ fontSize: "0.84rem", fontWeight: 600, color: colors.text, minWidth: 64, textAlign: "right" }}>{colors.statusLabel}</span>
      </div>
    </div>
  );
}

function RankStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: "0.72rem", color: T.inkSoft, margin: "0 0 0.3rem 0" }}>{label}</p>
      <p style={{ fontFamily: SERIF, fontSize: "1.1rem", fontWeight: 500, color: T.ink, margin: 0 }}>
        {value}
      </p>
    </div>
  );
}

export default function KpiDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const du = useDisplayUnit();
  const [error, setError] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [statements, setStatements] = useState<FinancialStatement[]>([]);
  const [userId, setUserId] = useState("");
  const [selectedId, setSelectedId] = useSelectedWorkspace(workspaces.map((w) => w.id));
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingPptx, setDownloadingPptx] = useState(false);
  const [rankingMetric, setRankingMetric] = useState(PEER_RANKING_METRICS[0].metric);

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push("/login");
        return;
      }
      const { data: wsData, error: wsError } = await supabase.from("sentinel_workspaces").select("*");
      if (wsError) {
        setError(wsError.message);
        setLoading(false);
        return;
      }
      const ws = sortWorkspaces((wsData ?? []) as Workspace[], sessionData.session.user.id);
      setUserId(sessionData.session.user.id);
      setWorkspaces(ws);

      const { data: stmtData, error: stmtError } = await supabase
        .from("sentinel_statements")
        .select("*")
        .in("workspace_id", ws.map((w) => w.id));
      if (stmtError) {
        setError(stmtError.message);
      } else {
        setStatements((stmtData ?? []) as FinancialStatement[]);
      }
      setLoading(false);
    })();
  }, [router]);

  if (loading) return <p style={{ color: T.inkSoft }}>Loading Sentinel...</p>;
  if (error) return <p style={{ color: T.ink }}>Could not load data: {error}</p>;

  if (workspaces.length === 0) {
    return (
      <div>
        <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0 }}>
          KPI Dashboard
        </h1>
        <p style={{ fontSize: "0.9rem", color: T.inkSoft, marginTop: "0.8rem" }}>
          No companies yet. Create one via New Project first.
        </p>
      </div>
    );
  }

  const selected = workspaces.find((w) => w.id === selectedId) ?? workspaces[0];

  async function exportPdf() {
    setDownloadingPdf(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/api/sentinel/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspace_id: selected.id, unit: du.unit }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selected.company_name.replace(/\s+/g, "_")}_MIS_Pack.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "PDF export failed");
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function exportPptx() {
    setDownloadingPptx(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/api/sentinel/export/pptx", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspace_id: selected.id, unit: du.unit }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selected.company_name.replace(/\s+/g, "_")}_Board_Deck.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "PPTX export failed");
    } finally {
      setDownloadingPptx(false);
    }
  }

  const sectorPeers = workspaces.filter((w) => w.sector === selected.sector);
  const peerRows = buildPeerTable(sectorPeers, statements, selected.id, "FY");
  const selfRow = peerRows.find((r) => r.is_subject) ?? null;

  const rankingDef =
    PEER_RANKING_METRICS.find((m) => m.metric === rankingMetric) ?? PEER_RANKING_METRICS[0];
  const rankingBenchmark = getBenchmark(peerRows, selected.id, rankingDef.metric, rankingDef.direction);
  const rank = computeRank(peerRows, selected.id, rankingDef.metric, rankingDef.direction);
  const rankConvert = (v: number) => (rankingDef.unit === "cr" ? du.fromCrore(v) : v);
  const rankRows = buildRankRows(peerRows, rankingDef.metric, rankConvert);
  const rankAverage = rankingBenchmark.industryAverage == null ? null : rankConvert(rankingBenchmark.industryAverage);

  const revenueBenchmark = getBenchmark(peerRows, selected.id, "revenue_cr");
  const ebitdaBenchmark = getBenchmark(peerRows, selected.id, "ebitda_margin");
  const patBenchmark = getBenchmark(peerRows, selected.id, "pat_margin");
  const yoyBenchmark = getBenchmark(peerRows, selected.id, "yoy_revenue_growth");
  const patAbsBenchmark = getBenchmark(peerRows, selected.id, "pat_cr");
  const patYoyBenchmark = getBenchmark(peerRows, selected.id, "yoy_pat_growth");
  const currentRatioBenchmark = getBenchmark(peerRows, selected.id, "current_ratio");
  const debtEquityBenchmark = getBenchmark(peerRows, selected.id, "debt_to_equity", "lower_is_better");
  const inventoryDaysBenchmark = getBenchmark(peerRows, selected.id, "inventory_days", "lower_is_better");
  const receivableDaysBenchmark = getBenchmark(peerRows, selected.id, "receivable_days", "lower_is_better");
  const payableDaysBenchmark = getBenchmark(peerRows, selected.id, "payable_days");
  const cccBenchmark = getBenchmark(peerRows, selected.id, "cash_conversion_cycle", "lower_is_better");

  const ownFYStatements = statements
    .filter((s) => s.workspace_id === selected.id && s.period_type === "FY")
    .sort((a, b) => a.period_end_date.localeCompare(b.period_end_date));
  // The statement the peer table used (latest year, on the company's own basis), so the health score,
  // the key figures and the peer ranking all describe the same period.
  const latestOwnStatement =
    ownFYStatements.find((s) => selfRow && s.period_label === selfRow.period_label && s.basis === selfRow.basis) ??
    ownFYStatements[ownFYStatements.length - 1] ??
    null;
  const priorOwnStatement = latestOwnStatement ? findPriorYear(latestOwnStatement, statements) : null;
  const healthScore = latestOwnStatement
    ? computeHealthScore(latestOwnStatement, priorOwnStatement, selected.sector, selected.currency_unit)
    : null;
  const quickSummary = healthScore ? buildQuickSummary(healthScore) : null;

  // Amount columns: the company's own basis only (a standalone and a consolidated year are not the same column),
  // in the display unit, oldest first.
  const trendBasis = latestOwnStatement?.basis ?? selected.comparison_basis;
  const trendStatements = ownFYStatements.filter((st) => st.basis === trendBasis);
  const trendLabels = trendStatements.map((st) => st.period_label);
  const toDisplay = (v: number | null | undefined) => (v == null ? null : du.fromCompany(v, selected.currency_unit));
  const revenueColumns = trendStatements.map((st) => ({ label: st.period_label, date: st.period_end_date, value: toDisplay(st.revenue_from_operations) }));
  const patColumns = trendStatements.map((st) => ({ label: st.period_label, date: st.period_end_date, value: toDisplay(st.profit_after_tax) }));
  const marginSeries = [
    { id: "ebitda", label: "EBITDA margin", subject: true, values: trendStatements.map((st) => (st.ebitda != null && st.revenue_from_operations ? st.ebitda / st.revenue_from_operations : null)) },
    { id: "pat", label: "PAT margin", secondary: true, values: trendStatements.map((st) => (st.revenue_from_operations ? st.profit_after_tax / st.revenue_from_operations : null)) },
  ];

  // Each key figure's change on the year before, and its shape over the years.
  let priorRatios: Record<string, number | null> | null = null;
  try {
    priorRatios = priorOwnStatement ? computeRatios(priorOwnStatement, findPriorYear(priorOwnStatement, statements), selected.sector) : null;
  } catch {
    priorRatios = null;
  }
  const series = (key: string, convert?: (v: number) => number) => buildTimeSeries(selected, statements, key).map((d) => (convert ? convert(d.value) : d.value));
  const own = (v: number) => du.fromCompany(v, selected.currency_unit);
  const vs = priorOwnStatement?.period_label;
  const ratioNow = (id: string) => selfRow?.ratios[id] ?? null;
  const ratioPrev = (id: string) => priorRatios?.[id] ?? null;
  // Read directly rather than through the ratios registry (which only carries a single number per id): the
  // card needs maxScore too, since a criterion the company lacks data for (shares outstanding, cost of
  // goods sold) is left out of the denominator rather than counted as a point not earned.
  const piotroskiNow = latestOwnStatement ? piotroskiF(latestOwnStatement, priorOwnStatement) : null;

  const tiles: { label: string; value: string; note: string | null; formula: string; delta: TileDelta | null; spark: number[] }[] = [
    {
      label: `Revenue (latest FY, ${du.crossLabel})`,
      value: selfRow ? num(du.fromCrore(selfRow.revenue_cr)) : "-",
      note: formatBenchmarkNote(revenueBenchmark, "cr", du),
      formula: "As reported: Revenue from Operations",
      delta: makeDelta("amount", "higher", latestOwnStatement?.revenue_from_operations ?? null, priorOwnStatement?.revenue_from_operations ?? null, vs),
      spark: series("revenue_from_operations", own),
    },
    {
      label: "EBITDA margin",
      value: pct(ratioNow("ebitda_margin")),
      note: formatBenchmarkNote(ebitdaBenchmark, "pp", du),
      formula: "EBITDA / Revenue from Operations",
      delta: makeDelta("percent", "higher", ratioNow("ebitda_margin"), ratioPrev("ebitda_margin"), vs),
      spark: series("ebitda_margin"),
    },
    {
      label: "PAT margin",
      value: pct(ratioNow("pat_margin")),
      note: formatBenchmarkNote(patBenchmark, "pp", du),
      formula: "Profit After Tax / Revenue from Operations",
      delta: makeDelta("percent", "higher", ratioNow("pat_margin"), ratioPrev("pat_margin"), vs),
      spark: series("pat_margin"),
    },
    {
      label: "Revenue YoY",
      value: pct(ratioNow("yoy_revenue_growth")),
      note: formatBenchmarkNote(yoyBenchmark, "pp", du),
      formula: "(Current Revenue - Prior Revenue) / Prior Revenue",
      delta: null,
      spark: series("yoy_revenue_growth"),
    },
    {
      label: `PAT (latest FY, ${du.crossLabel})`,
      value: selfRow ? num(du.fromCrore(selfRow.pat_cr)) : "-",
      note: formatBenchmarkNote(patAbsBenchmark, "cr", du),
      formula: "As reported: Profit After Tax",
      delta: makeDelta("amount", "higher", latestOwnStatement?.profit_after_tax ?? null, priorOwnStatement?.profit_after_tax ?? null, vs),
      spark: series("profit_after_tax", own),
    },
    {
      label: "PAT YoY",
      value: pct(ratioNow("yoy_pat_growth")),
      note: formatBenchmarkNote(patYoyBenchmark, "pp", du),
      formula: "(Current PAT - Prior PAT) / |Prior PAT| - measured against the size of the prior figure, so a loss that narrows reads as growth",
      delta: null,
      spark: series("yoy_pat_growth"),
    },
    {
      label: "Current ratio",
      value: ratioX(ratioNow("current_ratio")),
      note: formatBenchmarkNote(currentRatioBenchmark, "x", du),
      formula: "Current Assets / Current Liabilities",
      delta: makeDelta("multiple", "higher", ratioNow("current_ratio"), ratioPrev("current_ratio"), vs),
      spark: series("current_ratio"),
    },
    {
      label: "Debt-to-equity",
      value: ratioX(ratioNow("debt_to_equity")),
      note: formatBenchmarkNote(debtEquityBenchmark, "x", du),
      formula: "Total Debt / Total Equity",
      delta: makeDelta("multiple", "lower", ratioNow("debt_to_equity"), ratioPrev("debt_to_equity"), vs),
      spark: series("debt_to_equity"),
    },
    {
      label: "Inventory days",
      value: days(ratioNow("inventory_days")),
      note: formatBenchmarkNote(inventoryDaysBenchmark, "d", du),
      formula: "(Inventory / Total Expenses) x 365 - Total Expenses used as a COGS proxy",
      delta: makeDelta("days", "lower", ratioNow("inventory_days"), ratioPrev("inventory_days"), vs),
      spark: series("inventory_days"),
    },
    {
      label: "Receivable days",
      value: days(ratioNow("receivable_days")),
      note: formatBenchmarkNote(receivableDaysBenchmark, "d", du),
      formula: "(Trade Receivables / Revenue from Operations) x 365",
      delta: makeDelta("days", "lower", ratioNow("receivable_days"), ratioPrev("receivable_days"), vs),
      spark: series("receivable_days"),
    },
    {
      label: "Payable days",
      value: days(ratioNow("payable_days")),
      note: formatBenchmarkNote(payableDaysBenchmark, "d", du),
      formula: "(Trade Payables / Total Expenses) x 365 - Total Expenses used as a COGS proxy",
      delta: makeDelta("days", "neutral", ratioNow("payable_days"), ratioPrev("payable_days"), vs),
      spark: series("payable_days"),
    },
    {
      label: "Cash conversion cycle",
      value: days(ratioNow("cash_conversion_cycle")),
      note: formatBenchmarkNote(cccBenchmark, "d", du),
      formula: "Inventory Days + Receivable Days - Payable Days",
      delta: makeDelta("days", "lower", ratioNow("cash_conversion_cycle"), ratioPrev("cash_conversion_cycle"), vs),
      spark: series("cash_conversion_cycle"),
    },
    {
      label: "ROE",
      value: pct(ratioNow("roe")),
      note: formatBenchmarkNote(getBenchmark(peerRows, selected.id, "roe"), "pp", du),
      formula: "PAT / average equity (opening and closing; closing only when there is no prior year). Full years only; blank when equity is zero or negative",
      delta: makeDelta("percent", "higher", ratioNow("roe"), ratioPrev("roe"), vs),
      spark: series("roe"),
    },
    {
      label: "ROCE",
      value: pct(ratioNow("roce")),
      note: formatBenchmarkNote(getBenchmark(peerRows, selected.id, "roce"), "pp", du),
      formula: "EBIT / average capital employed, where EBIT = profit before tax + finance costs and capital employed = total assets - current liabilities. Full years only",
      delta: makeDelta("percent", "higher", ratioNow("roce"), ratioPrev("roce"), vs),
      spark: series("roce"),
    },
    {
      label: "Interest cover",
      value: ratioX(ratioNow("interest_cover")),
      note: formatBenchmarkNote(getBenchmark(peerRows, selected.id, "interest_cover"), "x", du),
      formula: "EBIT / finance costs: how many times the year's interest was earned",
      delta: makeDelta("multiple", "higher", ratioNow("interest_cover"), ratioPrev("interest_cover"), vs),
      spark: series("interest_cover"),
    },
    {
      label: "Net debt / EBITDA",
      value: ratioX(ratioNow("net_debt_to_ebitda")),
      note: formatBenchmarkNote(getBenchmark(peerRows, selected.id, "net_debt_to_ebitda", "lower_is_better"), "x", du),
      formula: "(Total debt - cash and equivalents) / EBITDA. Negative means more cash than debt. Full years only",
      delta: makeDelta("multiple", "lower", ratioNow("net_debt_to_ebitda"), ratioPrev("net_debt_to_ebitda"), vs),
      spark: series("net_debt_to_ebitda"),
    },
    {
      label: "Cash from operations / PAT",
      value: ratioX(ratioNow("cfo_to_pat")),
      note: formatBenchmarkNote(getBenchmark(peerRows, selected.id, "cfo_to_pat"), "x", du),
      formula: "Cash from operations / PAT. Persistently below 1x means profit is not turning into cash",
      delta: makeDelta("multiple", "higher", ratioNow("cfo_to_pat"), ratioPrev("cfo_to_pat"), vs),
      spark: series("cfo_to_pat"),
    },
    {
      label: `Free cash flow (${du.crossLabel})`,
      value: ratioNow("fcf_cr") == null ? "-" : num(du.fromCrore(ratioNow("fcf_cr")!)),
      note: ratioNow("fcf_cr") == null ? "Needs cash from operations and capital expenditure for a full year" : null,
      formula: "Cash from operations - capital expenditure. Negative means the year's investment was not covered by operating cash. Full years only",
      delta: makeDelta("amount", "higher", ratioNow("fcf_cr"), ratioPrev("fcf_cr"), vs),
      spark: series("fcf_cr", (v) => du.fromCrore(v)),
    },
    {
      label: "Free cash flow margin",
      value: pct(ratioNow("fcf_margin")),
      note: formatBenchmarkNote(getBenchmark(peerRows, selected.id, "fcf_margin"), "pp", du),
      formula: "Free cash flow / revenue from operations",
      delta: makeDelta("percent", "higher", ratioNow("fcf_margin"), ratioPrev("fcf_margin"), vs),
      spark: series("fcf_margin"),
    },
    {
      label: "Free cash flow / PAT",
      value: ratioX(ratioNow("fcf_conversion")),
      note: null,
      formula: "Free cash flow / profit after tax: how much of the profit was left as free cash. Blank for a loss-making year",
      delta: makeDelta("multiple", "higher", ratioNow("fcf_conversion"), ratioPrev("fcf_conversion"), vs),
      spark: series("fcf_conversion"),
    },
    {
      label: "Capex intensity",
      value: pct(ratioNow("capex_intensity")),
      note: null,
      formula: "Capital expenditure / revenue from operations: how much of sales is reinvested in the asset base. Neither high nor low is good by itself; read it with growth and returns",
      delta: makeDelta("percent", "lower", ratioNow("capex_intensity"), ratioPrev("capex_intensity"), vs),
      spark: series("capex_intensity"),
    },
    {
      label: "Effective tax rate",
      value: pct(ratioNow("effective_tax_rate")),
      note: null,
      formula: "Tax expense / profit before tax. Blank for a loss or zero-profit year. A rate far from the statutory one is worth a question about deferred tax and one-off items",
      delta: makeDelta("percent", "lower", ratioNow("effective_tax_rate"), ratioPrev("effective_tax_rate"), vs),
      spark: series("effective_tax_rate"),
    },
    {
      label: "Asset turnover",
      value: ratioX(ratioNow("asset_turnover")),
      note: formatBenchmarkNote(getBenchmark(peerRows, selected.id, "asset_turnover"), "x", du),
      formula: "Revenue / average total assets (closing only when there is no prior year). Full years only",
      delta: makeDelta("multiple", "higher", ratioNow("asset_turnover"), ratioPrev("asset_turnover"), vs),
      spark: series("asset_turnover"),
    },
    {
      label: "Altman Z\u2033",
      value: ratioNow("altman_z") == null ? "-" : ratioNow("altman_z")!.toFixed(2),
      note: ratioNow("altman_z") == null ? "Needs retained earnings, current assets and liabilities, total liabilities" : `${altmanZone(ratioNow("altman_z")!)} zone (above 2.6 safe, 1.1 to 2.6 grey, below 1.1 distress)`,
      formula: "6.56 x working capital/assets + 3.26 x retained earnings/assets + 6.72 x EBIT/assets + 1.05 x book equity/total liabilities. The version for non-manufacturers; a screen, not a verdict. Full years only",
      delta: makeDelta("multiple", "higher", ratioNow("altman_z"), ratioPrev("altman_z"), vs),
      spark: series("altman_z"),
    },
    {
      label: "Beneish M score",
      value: ratioNow("beneish_m") == null ? "-" : ratioNow("beneish_m")!.toFixed(2),
      note: ratioNow("beneish_m") == null ? "Needs cost of goods sold and SG&A for this and last year, which many filings do not print" : ratioNow("beneish_m")! > BENEISH_THRESHOLD ? `Above ${BENEISH_THRESHOLD}: the pattern resembles earnings manipulators - look closer` : `Below ${BENEISH_THRESHOLD}: the pattern does not resemble manipulators`,
      formula: "Beneish's eight-variable model on receivables, gross margin, asset quality, sales growth, depreciation, SG&A, leverage and accruals, against last year. Leverage uses total liabilities / assets and accruals use (PAT - cash from operations) / assets. A screen, not a verdict",
      delta: makeDelta("multiple", "lower", ratioNow("beneish_m"), ratioPrev("beneish_m"), vs),
      spark: series("beneish_m"),
    },
    {
      label: "Piotroski F-Score",
      value: piotroskiNow == null ? "-" : `${piotroskiNow.score}/${piotroskiNow.maxScore}`,
      note:
        piotroskiNow == null
          ? "Needs this and last year's profit, assets, cash from operations, debt, current assets and liabilities, and revenue"
          : piotroskiNow.score >= Math.ceil(piotroskiNow.maxScore * 0.75)
            ? "Most signals point the right way"
            : piotroskiNow.score <= Math.floor(piotroskiNow.maxScore * 0.25)
              ? "Most signals point the wrong way"
              : "A mixed picture",
      formula:
        "One point each for: positive ROA, positive cash from operations, ROA up on the year, cash from operations above profit after tax, " +
        "leverage (debt / assets) down, current ratio up, no new shares issued, gross margin up, asset turnover up. The last two need cost of " +
        "goods sold and shares outstanding respectively; out of 9 when both are on file, fewer otherwise. A screen, not a verdict",
      delta: makeDelta("multiple", "higher", ratioNow("piotroski_f"), ratioPrev("piotroski_f"), vs),
      spark: series("piotroski_f"),
    },
    {
      label: `Market cap (${du.crossLabel})`,
      value: ratioNow("market_cap_cr") == null ? "-" : num(du.fromCrore(ratioNow("market_cap_cr")!)),
      note: selected.market_price == null ? "Needs a share price - set one on this project's Settings page" : `${selected.market_price_as_of ? `As of ${selected.market_price_as_of}` : "No date set"}; needs shares outstanding too`,
      formula: "Share price x shares outstanding. The price is your own entry (Settings), not a live feed",
      delta: makeDelta("amount", "higher", ratioNow("market_cap_cr"), ratioPrev("market_cap_cr"), vs),
      spark: series("market_cap_cr", (v) => du.fromCrore(v)),
    },
    {
      label: `Enterprise value (${du.crossLabel})`,
      value: ratioNow("ev_cr") == null ? "-" : num(du.fromCrore(ratioNow("ev_cr")!)),
      formula: "Market cap + total debt - cash and equivalents",
      note: null,
      delta: makeDelta("amount", "higher", ratioNow("ev_cr"), ratioPrev("ev_cr"), vs),
      spark: series("ev_cr", (v) => du.fromCrore(v)),
    },
    {
      label: "P/E",
      value: ratioX(ratioNow("pe_ratio")),
      formula: "Market cap / profit after tax. Blank for a loss-making year - a negative P/E is not a meaningful multiple",
      note: null,
      delta: makeDelta("multiple", "lower", ratioNow("pe_ratio"), ratioPrev("pe_ratio"), vs),
      spark: series("pe_ratio"),
    },
    {
      label: "EV/EBITDA",
      value: ratioX(ratioNow("ev_ebitda")),
      formula: "Enterprise value / EBITDA",
      note: null,
      delta: makeDelta("multiple", "lower", ratioNow("ev_ebitda"), ratioPrev("ev_ebitda"), vs),
      spark: series("ev_ebitda"),
    },
    {
      label: "EV/Sales",
      value: ratioX(ratioNow("ev_sales")),
      formula: "Enterprise value / Revenue from operations",
      note: null,
      delta: makeDelta("multiple", "lower", ratioNow("ev_sales"), ratioPrev("ev_sales"), vs),
      spark: series("ev_sales"),
    },
    {
      label: "Price / book",
      value: ratioX(ratioNow("pb_ratio")),
      note: formatBenchmarkNote(getBenchmark(peerRows, selected.id, "pb_ratio", "lower_is_better"), "x", du),
      formula: "Market cap / total equity. Blank for zero or negative equity. Uses today's price, so past years are not shown against it",
      delta: null,
      spark: [],
    },
    {
      label: "Free cash flow yield",
      value: pct(ratioNow("fcf_yield")),
      note: formatBenchmarkNote(getBenchmark(peerRows, selected.id, "fcf_yield"), "pp", du),
      formula: "Free cash flow / market cap: the cash return at today's price. Negative when free cash flow is negative",
      delta: null,
      spark: [],
    },
    {
      label: "Earnings per share",
      value: rupees(ratioNow("eps")),
      note: ratioNow("eps") == null ? "Needs shares outstanding (on the statement). Dividend per share, and so dividend yield, is not held in Sentinel" : "Profit after tax / shares outstanding. Dividend per share, and so dividend yield, is not held in Sentinel",
      formula: "Profit after tax / shares outstanding, in rupees",
      delta: makeDelta("amount", "higher", ratioNow("eps"), latestOwnStatement && priorOwnStatement ? epsRupees(priorOwnStatement, croreFactor(selected.currency_unit)) : null, vs),
      spark: series("eps"),
    },
    {
      label: "Book value per share",
      value: rupees(ratioNow("bvps")),
      note: null,
      formula: "Total equity / shares outstanding, in rupees. Blank for zero or negative equity",
      delta: makeDelta("amount", "higher", ratioNow("bvps"), priorOwnStatement ? bookValuePerShareRupees(priorOwnStatement, croreFactor(selected.currency_unit)) : null, vs),
      spark: series("bvps"),
    },
  ];

  const debt = latestOwnStatement?.total_debt ?? null;
  const equity = latestOwnStatement?.total_equity ?? null;
  const capitalTotal = debt != null && equity != null ? debt + equity : null;
  // A split bar needs positive parts; negative equity is shown as figures only (see the stats below it).
  const hasCapitalData = debt != null && equity != null && debt >= 0 && equity > 0 && capitalTotal != null && capitalTotal > 0;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.6rem",
        }}
      >
        <select aria-label="Company" value={selected.id} onChange={(e) => setSelectedId(e.target.value)} style={selectStyle}>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {workspaceOptionLabel(w, userId)}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button onClick={exportPdf} disabled={downloadingPdf} style={{ ...btnQuiet, opacity: downloadingPdf ? 0.6 : 1 }}>
            {downloadingPdf ? "Generating PDF..." : "Export PDF"}
          </button>
          <button onClick={exportPptx} disabled={downloadingPptx} style={{ ...btnQuiet, opacity: downloadingPptx ? 0.6 : 1 }}>
            {downloadingPptx ? "Generating PPTX..." : "Export PPTX"}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.8rem", flexWrap: "wrap" }}>
          <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", color: T.ink, margin: 0 }}>
            {selected.company_name}
          </h1>
          {latestOwnStatement && (
            <span style={{ fontSize: "0.85rem", color: T.inkSoft }}>{latestOwnStatement.period_label}</span>
          )}
          {healthScore && (
            <span style={{ fontSize: "0.95rem", fontWeight: 600, color: HEALTH_COLORS[healthScore.overall].text }}>
              {HEALTH_COLORS[healthScore.overall].statusLabel}
            </span>
          )}
        </div>
        {quickSummary && (
          <p style={{ fontSize: "1rem", lineHeight: 1.65, color: T.ink, margin: "0.9rem 0 0 0", maxWidth: 720 }}>
            {quickSummary}
          </p>
        )}
        {healthScore && (
          <a
            href={`/sentinel?workspace=${selected.id}`}
            style={{ fontSize: "0.82rem", color: T.accent, textDecoration: "none", marginTop: "0.7rem", display: "inline-block" }}
          >
            View investigations for {selected.company_name} &gt;
          </a>
        )}
      </div>

      {healthScore && (
        <Schedule title="Business health">
          <div>
            {healthScore.categories.map((c, i) => (
              <HealthRow key={c.key} category={c} isLast={i === healthScore.categories.length - 1} />
            ))}
          </div>
        </Schedule>
      )}

      <Schedule title="Key figures">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            borderTop: `1px solid ${T.ink}`,
            borderBottom: `1px solid ${T.rule}`,
          }}
        >
          {tiles.map((t, i) => (
            <StatTile key={t.label} ledger index={i} label={t.label} value={t.value} note={t.note} formula={t.formula} delta={t.delta} spark={t.spark} sparkTitle={`${t.label} across the years on file`} />
          ))}
        </div>
      </Schedule>

      <Schedule
        title="Peer standing"
        subtitle={formatIndustryLine(rankingBenchmark, rankingDef.unit, du)}
        right={
          <select value={rankingMetric} onChange={(e) => setRankingMetric(e.target.value)} style={selectStyle}>
            {PEER_RANKING_METRICS.map((m) => (
              <option key={m.metric} value={m.metric}>
                {m.label}
              </option>
            ))}
          </select>
        }
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "1rem",
            marginBottom: "1.5rem",
          }}
        >
          <RankStat label="Rank" value={rank ? `${rank.rank} of ${rank.total}` : "-"} />
          <RankStat
            label="Percentile"
            value={rankingBenchmark.percentile != null ? ordinal(rankingBenchmark.percentile) : "-"}
          />
          <RankStat
            label="Closest peer"
            value={rankingBenchmark.closestPeer ? rankingBenchmark.closestPeer.company_name : "-"}
          />
          <RankStat
            label="Gap to closest peer"
            value={formatBenchmarkNote(rankingBenchmark, rankingDef.unit, du) ?? "-"}
          />
          <RankStat
            label="Industry leader"
            value={
              rankingBenchmark.industryLeader
                ? `${rankingBenchmark.industryLeader.company_name} (${formatByUnit(
                    rankingBenchmark.industryLeader.value,
                    rankingDef.unit,
                    du
                  )})`
                : "-"
            }
          />
          <RankStat
            label="Industry average"
            value={
              rankingBenchmark.industryAverage != null
                ? formatByUnit(rankingBenchmark.industryAverage, rankingDef.unit, du)
                : "-"
            }
          />
        </div>
        <RankChart
          rows={rankRows}
          subjectId={selected.id}
          kind={KIND_OF_UNIT[rankingDef.unit]}
          want={rankingDef.direction === "lower_is_better" ? "lower" : "higher"}
          average={rankAverage}
          ariaLabel={`Peer standing: ${rankingDef.label}`}
          caption={rankingDef.unit === "cr" ? `Amounts in ${du.crossLabel}, whatever unit each company reports in. Best first.` : rankingDef.direction === "lower_is_better" ? "Lower is better, so the lowest is first." : "Best first."}
          unitHeader={rankingDef.unit === "cr" ? du.crossLabel : undefined}
        />
      </Schedule>

      <Schedule title="Trend" subtitle={trendStatements.length > 0 ? `${trendBasis} basis, ${trendLabels[0]} to ${trendLabels[trendLabels.length - 1]}` : null}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "2rem" }}>
          <div>
            <p style={{ fontSize: "0.78rem", color: T.inkSoft, margin: "0 0 0.8rem 0" }}>Revenue ({du.ownLabel(selected.currency_unit)})</p>
            <ColumnChart data={revenueColumns} seriesLabel="Revenue" ariaLabel="Revenue by year" unitHeader={du.ownLabel(selected.currency_unit)} />
          </div>
          <div>
            <p style={{ fontSize: "0.78rem", color: T.inkSoft, margin: "0 0 0.8rem 0" }}>Profit after tax ({du.ownLabel(selected.currency_unit)})</p>
            <ColumnChart data={patColumns} seriesLabel="Profit after tax" ariaLabel="Profit after tax by year" unitHeader={du.ownLabel(selected.currency_unit)} />
          </div>
        </div>
        {trendStatements.length >= 2 && (
          <div style={{ marginTop: "2rem" }}>
            <p style={{ fontSize: "0.78rem", color: T.inkSoft, margin: "0 0 0.8rem 0" }}>Margins, as a share of revenue</p>
            <LineChart xLabels={trendLabels} xDates={trendStatements.map((st) => st.period_end_date)} series={marginSeries} kind="percent" ariaLabel="EBITDA and PAT margin by year" height={240} />
          </div>
        )}
      </Schedule>

      <Schedule title="Capital structure">
        {debt != null && equity != null && capitalTotal != null ? (
          <>
            {hasCapitalData && (
              <div style={{ marginBottom: "1.3rem" }}>
                <SplitBar
                  ariaLabel="Capital structure: debt and equity"
                  unitHeader={du.ownLabel(selected.currency_unit)}
                  segments={[
                    { id: "debt", label: "Debt", value: debt, color: VIZ.subject, display: num(du.fromCompany(debt, selected.currency_unit)) },
                    { id: "equity", label: "Equity", value: equity, color: VIZ.secondary, display: num(du.fromCompany(equity, selected.currency_unit)) },
                  ]}
                />
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem" }}>
              <RankStat label={`Total debt (${du.ownLabel(selected.currency_unit)})`} value={num(du.fromCompany(debt, selected.currency_unit))} />
              <RankStat label={`Total equity (${du.ownLabel(selected.currency_unit)})`} value={num(du.fromCompany(equity, selected.currency_unit))} />
              <RankStat label="Debt-to-equity" value={ratioX(equity > 0 ? debt / equity : null)} />
              <RankStat label="Debt-to-capital" value={capitalTotal > 0 && equity > 0 ? pct(debt / capitalTotal) : "-"} />
            </div>
            {equity <= 0 && <p style={{ fontSize: "0.78rem", color: T.inkSoft, margin: "0.9rem 0 0 0" }}>Equity is zero or negative, so the capital mix is not drawn and the ratios that need it are not computed.</p>}
          </>
        ) : (
          <p style={{ fontSize: "0.88rem", color: T.inkSoft, margin: 0 }}>
            No Balance Sheet data on file yet for this company.
          </p>
        )}
      </Schedule>
    </div>
  );
}
