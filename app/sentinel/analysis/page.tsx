"use client";
export const dynamic = "force-dynamic";

// Sentinel - Deep Analysis, restructured to resolve a real overlap with
// KPI Dashboard rather than just re-skinning it. KPI Dashboard's Peer
// Standing section already owns "where does this company stand right
// now" (rank, percentile, gap to closest peer) - and does it with more
// depth than this page's old single-metric bar chart ever had. This
// page's redesigned, non-duplicated job: how have these companies'
// trajectories compared over time, not just where they stand today.
//
// The Peer Comparison bar chart is gone entirely (deleted, not
// restyled). Trend is now a multi-company overlay: every sector peer's
// line for the selected metric, on one chart, with the "Viewing as"
// company highlighted in the brand accent color and every other peer
// shown as a quiet gray context line. This is a genuine, common
// analytical pattern (subject vs. the pack), not a stylistic choice -
// see MultiTrendLineChart in charts.tsx.
//
// Cross-company date alignment is built from each statement's real
// period_end_date, not from period_label strings - a plain label sort
// would put "Q1 FY25" before "Q4 FY24" alphabetically, which is
// chronologically wrong. Each company's line shows a real gap wherever
// it has no data for a period, rather than interpolating across one.
//
// Known trade-off, stated plainly: with more than ~2 peer lines and
// only one accent color under the brand spec, the non-highlighted
// lines are not individually distinguishable from each other by color
// alone - mitigated with a hover tooltip per point and the text legend
// below the chart, not solved outright.
//
// "Viewing as" still genuinely controls which company's line is
// highlighted and which sector's peer set is shown (is_subject is
// call-time now, not a hardcoded flag - see engine.ts). Read-only, no
// review actions.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { MultiTrendLineChart } from "../lib/charts";
import { buildPeerTable, computeRatios, findPriorYear } from "../lib/engine";
import { getBenchmark, type Benchmark } from "../lib/benchmark";
import { SERIF, T } from "../lib/theme";
import type { FinancialStatement, Workspace } from "../lib/types";

// One entry per metric, carrying both key namespaces this page needs:
// peerKey for getBenchmark/PeerRow (revenue_cr/pat_cr for the two
// absolute figures, same ratio id as trendKey for everything else),
// trendKey for reading FinancialStatement/computeRatios directly. id is
// a stable selector value distinct from both, since revenue/PAT would
// otherwise have two different key spellings and no single identifier.
const METRICS: {
  id: string;
  label: string;
  peerKey: string;
  trendKey: string;
  unit: "pp" | "cr" | "x" | "d";
  direction: "higher_is_better" | "lower_is_better";
}[] = [
  { id: "revenue", label: "Revenue", peerKey: "revenue_cr", trendKey: "revenue_from_operations", unit: "cr", direction: "higher_is_better" },
  { id: "pat", label: "PAT", peerKey: "pat_cr", trendKey: "profit_after_tax", unit: "cr", direction: "higher_is_better" },
  { id: "ebitda_margin", label: "EBITDA margin", peerKey: "ebitda_margin", trendKey: "ebitda_margin", unit: "pp", direction: "higher_is_better" },
  { id: "pat_margin", label: "PAT margin", peerKey: "pat_margin", trendKey: "pat_margin", unit: "pp", direction: "higher_is_better" },
  { id: "yoy_revenue_growth", label: "Revenue YoY", peerKey: "yoy_revenue_growth", trendKey: "yoy_revenue_growth", unit: "pp", direction: "higher_is_better" },
  { id: "yoy_pat_growth", label: "PAT YoY", peerKey: "yoy_pat_growth", trendKey: "yoy_pat_growth", unit: "pp", direction: "higher_is_better" },
  { id: "current_ratio", label: "Current ratio", peerKey: "current_ratio", trendKey: "current_ratio", unit: "x", direction: "higher_is_better" },
  { id: "debt_to_equity", label: "Debt-to-equity", peerKey: "debt_to_equity", trendKey: "debt_to_equity", unit: "x", direction: "lower_is_better" },
  { id: "inventory_days", label: "Inventory days", peerKey: "inventory_days", trendKey: "inventory_days", unit: "d", direction: "lower_is_better" },
  { id: "receivable_days", label: "Receivable days", peerKey: "receivable_days", trendKey: "receivable_days", unit: "d", direction: "lower_is_better" },
  { id: "payable_days", label: "Payable days", peerKey: "payable_days", trendKey: "payable_days", unit: "d", direction: "higher_is_better" },
  { id: "cash_conversion_cycle", label: "Cash conversion cycle", peerKey: "cash_conversion_cycle", trendKey: "cash_conversion_cycle", unit: "d", direction: "lower_is_better" },
];

const selectStyle: React.CSSProperties = {
  fontFamily: "inherit",
  fontSize: "0.85rem",
  padding: "0.4rem 0.6rem",
  border: `1px solid ${T.rule}`,
  borderRadius: 3,
  background: T.card,
  color: T.ink,
};

function formatIndustryLine(b: Benchmark | null, unit: "pp" | "cr" | "x" | "d"): string | null {
  if (!b || b.industryAverage == null || !b.industryLeader) return null;
  const fmt = (v: number) =>
    unit === "pp"
      ? `${(v * 100).toFixed(1)}%`
      : unit === "x"
      ? `${v.toFixed(2)}x`
      : unit === "d"
      ? `${v.toFixed(0)}d`
      : v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return `Industry average ${fmt(b.industryAverage)}, led by ${b.industryLeader.company_name} at ${fmt(
    b.industryLeader.value
  )}`;
}

const RAW_TREND_FIELDS = new Set([
  "revenue_from_operations",
  "profit_after_tax",
  "profit_before_tax",
  "ebitda",
]);

type TrendPoint = { label: string; value: number; date: string };

// One company's points for one metric, over one granularity - carries
// the real period_end_date alongside each point so multiple companies'
// series can be merged onto one correctly-ordered timeline later
// (buildUnifiedTimeline below), since period_label strings alone don't
// sort safely across companies (e.g. "Q1 FY25" < "Q4 FY24" alphabetically,
// which is chronologically wrong).
function buildTrendPoints(
  workspace: Workspace,
  statements: FinancialStatement[],
  metricKey: string,
  periodType: "FY" | "quarterly"
): TrendPoint[] {
  const relevant = statements
    .filter(
      (s) =>
        s.workspace_id === workspace.id &&
        (periodType === "FY" ? s.period_type === "FY" : ["Q1", "Q2", "Q3", "Q4"].includes(s.period_type))
    )
    .sort((a, b) => (a.period_end_date < b.period_end_date ? -1 : 1));

  const out: TrendPoint[] = [];
  for (const stmt of relevant) {
    let value: number | null;
    if (RAW_TREND_FIELDS.has(metricKey)) {
      value = (stmt as unknown as Record<string, number | null>)[metricKey] ?? null;
    } else {
      const prior = findPriorYear(stmt, statements);
      const ratios = computeRatios(stmt, prior, workspace.sector);
      value = ratios[metricKey] ?? null;
    }
    if (value != null) out.push({ label: stmt.period_label, value, date: stmt.period_end_date });
  }
  return out;
}

function buildUnifiedTimeline(allPoints: TrendPoint[][]): { date: string; label: string }[] {
  const map = new Map<string, string>();
  for (const points of allPoints) {
    for (const p of points) {
      if (!map.has(p.date)) map.set(p.date, p.label);
    }
  }
  return [...map.entries()]
    .map(([date, label]) => ({ date, label }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function alignToTimeline(points: TrendPoint[], timeline: { date: string }[]): (number | null)[] {
  const byDate = new Map(points.map((p) => [p.date, p.value]));
  return timeline.map((t) => byDate.get(t.date) ?? null);
}

// A schedule: same bordered-section treatment as the KPI Dashboard
// redesign, duplicated here rather than shared - matches this
// codebase's existing convention of each page owning its own
// presentational helpers.
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

export default function DeepAnalysisPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [statements, setStatements] = useState<FinancialStatement[]>([]);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [metricId, setMetricId] = useState(METRICS[0].id);
  const [periodType, setPeriodType] = useState<"FY" | "quarterly">("FY");

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
      const ws = (wsData ?? []) as Workspace[];
      setWorkspaces(ws);
      if (ws.length > 0) setPrimaryId(ws[0].id);

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
  if (workspaces.length === 0 || !primaryId) {
    return <p style={{ color: T.inkSoft }}>No workspaces available yet.</p>;
  }

  const primaryWorkspace = workspaces.find((w) => w.id === primaryId)!;
  const sectorWorkspaces = workspaces.filter((w) => w.sector === primaryWorkspace.sector);
  const allWorkspacesSorted = [...workspaces].sort((a, b) =>
    a.company_name.localeCompare(b.company_name)
  );

  const metric = METRICS.find((m) => m.id === metricId) ?? METRICS[0];

  const peerRows = buildPeerTable(sectorWorkspaces, statements, primaryId, "FY");
  const benchmark = getBenchmark(peerRows, primaryId, metric.peerKey, metric.direction);
  const industryLine = formatIndustryLine(benchmark, metric.unit);

  const perCompany = sectorWorkspaces.map((w) => ({
    workspace: w,
    points: buildTrendPoints(w, statements, metric.trendKey, periodType),
  }));
  const timeline = buildUnifiedTimeline(perCompany.map((p) => p.points));
  const xLabels = timeline.map((t) => t.label);
  const series = perCompany.map(({ workspace, points }) => ({
    label: workspace.company_name,
    values: alignToTimeline(points, timeline),
    highlight: workspace.id === primaryId,
  }));
  const hasAnyData = series.some((s) => s.values.some((v) => v != null));

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
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <label style={{ fontSize: "0.8rem", color: T.inkSoft }}>Viewing as</label>
          <select value={primaryId} onChange={(e) => setPrimaryId(e.target.value)} style={selectStyle}>
            {allWorkspacesSorted.map((w) => (
              <option key={w.id} value={w.id}>
                {w.company_name}
              </option>
            ))}
          </select>
        </div>
        <a
          href={`/sentinel?workspace=${primaryId}`}
          style={{ fontSize: "0.82rem", color: T.accent, textDecoration: "none" }}
        >
          View investigations for {primaryWorkspace.company_name} &gt;
        </a>
      </div>

      <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", color: T.ink, margin: "0 0 0.5rem 0" }}>
        Deep Analysis
      </h1>
      <p style={{ fontSize: "0.85rem", color: T.inkSoft, margin: "0 0 1.8rem 0" }}>
        How trajectories compare over time, not just where things stand today.
      </p>

      <Schedule
        title="Trend comparison"
        subtitle={industryLine}
        right={
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            <select value={metricId} onChange={(e) => setMetricId(e.target.value)} style={selectStyle}>
              {METRICS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as "FY" | "quarterly")}
              style={selectStyle}
            >
              <option value="FY">Annual (FY)</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </div>
        }
      >
        {hasAnyData ? (
          <>
            <MultiTrendLineChart xLabels={xLabels} series={series} isRatio={metric.unit === "pp"} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 1.1rem", marginTop: "1rem" }}>
              {sectorWorkspaces.map((w) => (
                <span
                  key={w.id}
                  style={{
                    fontSize: "0.76rem",
                    color: w.id === primaryId ? T.accent : T.inkSoft,
                    fontWeight: w.id === primaryId ? 600 : 400,
                  }}
                >
                  {w.company_name}
                </span>
              ))}
            </div>
            {peerRows.some((r) => r.basis_caveat) && (
              <p style={{ fontSize: "0.75rem", color: T.inkSoft, marginTop: "1rem" }}>
                {peerRows
                  .filter((r) => r.basis_caveat)
                  .map((r) => `${r.company_name}: ${r.basis_caveat}`)
                  .join(" - ")}
              </p>
            )}
          </>
        ) : (
          <p style={{ fontSize: "0.85rem", color: T.inkSoft }}>
            No {periodType === "FY" ? "annual" : "quarterly"} records on file yet for this metric
            across the {primaryWorkspace.sector} sector.
          </p>
        )}
      </Schedule>
    </div>
  );
}
