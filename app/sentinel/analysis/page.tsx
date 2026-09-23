"use client";
export const dynamic = "force-dynamic";

// Sentinel - Deep Analysis, given the same visual treatment as the KPI
// Dashboard redesign: a Schedule wrapper (bordered section, plain
// serif heading, no tracked-out uppercase eyebrow) instead of each
// section rolling its own box styling, and the decorative uppercase
// subtitle under the H1 removed.
//
// Deliberately NOT given a masthead-style verdict header the way KPI
// Dashboard was - this page is a cross-company exploration tool (any
// company, any metric, any trend granularity), not a single-company
// diagnostic, so there is no one "verdict" to lead with here. "Deep
// Analysis" stays the literal page title rather than being swapped for
// a company name.
//
// Worth knowing going in: Peer comparison here and KPI Dashboard's
// Peer Standing now cover almost identical ground (same metric list,
// same benchmark stats, same bar chart) - that overlap isn't resolved
// by this redesign, since it's a product-scope question, not a styling
// one. The one thing this page still does that KPI Dashboard doesn't:
// trend across any of the 12 metrics with an FY/Quarterly toggle.
//
// "Viewing as" still genuinely controls which bar gets highlighted in
// the peer chart (is_subject is call-time now, not a hardcoded flag -
// see engine.ts). Read-only, no review actions.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { HorizontalBarChart, TrendLineChart } from "../lib/charts";
import { buildPeerTable, buildTimeSeries, computeRatios, findPriorYear } from "../lib/engine";
import { getBenchmark, type Benchmark } from "../lib/benchmark";
import { SERIF, T } from "../lib/theme";
import type { FinancialStatement, PeerRow, Workspace } from "../lib/types";

const PEER_METRICS: {
  label: string;
  key: string;
  unit: "pp" | "cr" | "x" | "d";
  direction: "higher_is_better" | "lower_is_better";
}[] = [
  { label: "Revenue (Rs cr)", key: "revenue_cr", unit: "cr", direction: "higher_is_better" },
  { label: "PAT (Rs cr)", key: "pat_cr", unit: "cr", direction: "higher_is_better" },
  { label: "EBITDA margin", key: "ebitda_margin", unit: "pp", direction: "higher_is_better" },
  { label: "PAT margin", key: "pat_margin", unit: "pp", direction: "higher_is_better" },
  { label: "Revenue YoY", key: "yoy_revenue_growth", unit: "pp", direction: "higher_is_better" },
  { label: "PAT YoY", key: "yoy_pat_growth", unit: "pp", direction: "higher_is_better" },
  { label: "Current ratio", key: "current_ratio", unit: "x", direction: "higher_is_better" },
  { label: "Debt-to-equity", key: "debt_to_equity", unit: "x", direction: "lower_is_better" },
  { label: "Inventory days", key: "inventory_days", unit: "d", direction: "lower_is_better" },
  { label: "Receivable days", key: "receivable_days", unit: "d", direction: "lower_is_better" },
  { label: "Payable days", key: "payable_days", unit: "d", direction: "higher_is_better" },
  { label: "Cash conversion cycle", key: "cash_conversion_cycle", unit: "d", direction: "lower_is_better" },
];

const TREND_METRICS: {
  label: string;
  key: string;
  unit: "pp" | "cr" | "x" | "d";
}[] = [
  { label: "Revenue (Rs cr)", key: "revenue_from_operations", unit: "cr" },
  { label: "PAT (Rs cr)", key: "profit_after_tax", unit: "cr" },
  { label: "EBITDA margin", key: "ebitda_margin", unit: "pp" },
  { label: "PAT margin", key: "pat_margin", unit: "pp" },
  { label: "Revenue YoY", key: "yoy_revenue_growth", unit: "pp" },
  { label: "PAT YoY", key: "yoy_pat_growth", unit: "pp" },
  { label: "Current ratio", key: "current_ratio", unit: "x" },
  { label: "Debt-to-equity", key: "debt_to_equity", unit: "x" },
  { label: "Inventory days", key: "inventory_days", unit: "d" },
  { label: "Receivable days", key: "receivable_days", unit: "d" },
  { label: "Payable days", key: "payable_days", unit: "d" },
  { label: "Cash conversion cycle", key: "cash_conversion_cycle", unit: "d" },
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

function peerValue(row: PeerRow, key: string): number | null {
  if (key === "revenue_cr" || key === "pat_cr") return row[key as "revenue_cr" | "pat_cr"];
  return row.ratios[key] ?? null;
}

function formatBenchmarkNote(b: Benchmark | null, unit: "pp" | "cr" | "x" | "d"): string | null {
  if (!b || !b.closestPeer || b.gapToClosestPeer == null) return null;
  const sign = b.gapToClosestPeer >= 0 ? "+" : "";
  const magnitude =
    unit === "pp"
      ? `${(b.gapToClosestPeer * 100).toFixed(1)}pp`
      : unit === "x"
      ? `${b.gapToClosestPeer.toFixed(2)}x`
      : unit === "d"
      ? `${b.gapToClosestPeer.toFixed(0)}d`
      : `${b.gapToClosestPeer.toLocaleString("en-IN", { maximumFractionDigits: 0 })} cr`;
  return `vs ${b.closestPeer.company_name}: ${sign}${magnitude}`;
}

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

// buildTimeSeries (engine.ts) only matches ONE exact period_type per
// call, so it cannot natively produce a single Q1-through-Q4-across-
// years trend line. This reimplements its exact same logic (same raw-
// field set, same computeRatios/findPriorYear fallback for everything
// else) but merged across all four quarter types - the one case
// buildTimeSeries itself cannot express, not a new computation
// convention.
const RAW_TREND_FIELDS = new Set([
  "revenue_from_operations",
  "profit_after_tax",
  "profit_before_tax",
  "ebitda",
]);

function computeQuarterlyTrend(
  workspace: Workspace,
  statements: FinancialStatement[],
  metricKey: string
): { label: string; value: number }[] {
  const own = statements
    .filter((s) => s.workspace_id === workspace.id && ["Q1", "Q2", "Q3", "Q4"].includes(s.period_type))
    .sort((a, b) => (a.period_end_date < b.period_end_date ? -1 : 1));

  const out: { label: string; value: number }[] = [];
  for (const stmt of own) {
    let value: number | null;
    if (RAW_TREND_FIELDS.has(metricKey)) {
      value = (stmt as unknown as Record<string, number | null>)[metricKey] ?? null;
    } else {
      const prior = findPriorYear(stmt, statements);
      const ratios = computeRatios(stmt, prior, workspace.sector);
      value = ratios[metricKey] ?? null;
    }
    if (value != null) out.push({ label: stmt.period_label, value });
  }
  return out;
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
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [peerMetricKey, setPeerMetricKey] = useState(PEER_METRICS[0].key);
  const [trendWorkspaceId, setTrendWorkspaceId] = useState<string | null>(null);
  const [trendMetricKey, setTrendMetricKey] = useState(TREND_METRICS[1].key);
  const [trendPeriodType, setTrendPeriodType] = useState<"FY" | "quarterly">("FY");

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
      if (ws.length > 0) setSubjectId(ws[0].id);

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
  if (workspaces.length === 0 || !subjectId) {
    return <p style={{ color: T.inkSoft }}>No workspaces available yet.</p>;
  }

  const subjectWorkspace = workspaces.find((w) => w.id === subjectId)!;
  const sectorWorkspaces = workspaces.filter((w) => w.sector === subjectWorkspace.sector);
  const allWorkspacesSorted = [...workspaces].sort((a, b) =>
    a.company_name.localeCompare(b.company_name)
  );
  const peerRows = buildPeerTable(sectorWorkspaces, statements, subjectId, "FY");
  const peerMetric = PEER_METRICS.find((m) => m.key === peerMetricKey)!;
  const peerBenchmark = getBenchmark(peerRows, subjectId, peerMetricKey, peerMetric.direction);
  const barData = peerRows
    .map((r) => ({ label: r.company_name, value: peerValue(r, peerMetricKey) }))
    .filter((d): d is { label: string; value: number } => d.value != null);

  const activeTrendId = trendWorkspaceId ?? subjectId;
  const trendWorkspace = workspaces.find((w) => w.id === activeTrendId);
  const trendMetric = TREND_METRICS.find((m) => m.key === trendMetricKey)!;
  const trendData = trendWorkspace
    ? trendPeriodType === "FY"
      ? buildTimeSeries(trendWorkspace, statements, trendMetricKey, "FY")
      : computeQuarterlyTrend(trendWorkspace, statements, trendMetricKey)
    : [];

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
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} style={selectStyle}>
            {allWorkspacesSorted.map((w) => (
              <option key={w.id} value={w.id}>
                {w.company_name}
              </option>
            ))}
          </select>
        </div>
        <a
          href={`/sentinel?workspace=${subjectId}`}
          style={{ fontSize: "0.82rem", color: T.accent, textDecoration: "none" }}
        >
          View investigations for {subjectWorkspace.company_name} &gt;
        </a>
      </div>

      <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", color: T.ink, margin: "0 0 1.8rem 0" }}>
        Deep Analysis
      </h1>

      <Schedule
        title="Peer comparison"
        subtitle={
          [
            `${subjectWorkspace.company_name}'s bar is highlighted. Absolute figures are not directly comparable across standalone vs. consolidated companies.`,
            formatIndustryLine(peerBenchmark, peerMetric.unit),
          ]
            .filter(Boolean)
            .join(" ")
        }
        right={
          <select value={peerMetricKey} onChange={(e) => setPeerMetricKey(e.target.value)} style={selectStyle}>
            {PEER_METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        }
      >
        {formatBenchmarkNote(peerBenchmark, peerMetric.unit) && (
          <p style={{ fontSize: "0.78rem", color: T.inkSoft, margin: "0 0 1rem 0" }}>
            {formatBenchmarkNote(peerBenchmark, peerMetric.unit)}
          </p>
        )}
        <HorizontalBarChart
          data={barData}
          isRatio={peerMetric.unit === "pp"}
          highlightLabel={subjectWorkspace.company_name}
        />
        {peerRows.some((r) => r.basis_caveat) && (
          <p style={{ fontSize: "0.75rem", color: T.inkSoft, marginTop: "1rem" }}>
            {peerRows
              .filter((r) => r.basis_caveat)
              .map((r) => `${r.company_name}: ${r.basis_caveat}`)
              .join(" - ")}
          </p>
        )}
      </Schedule>

      <Schedule
        title="Trend"
        right={
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            <select
              value={activeTrendId ?? ""}
              onChange={(e) => setTrendWorkspaceId(e.target.value)}
              style={selectStyle}
            >
              {allWorkspacesSorted.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.company_name}
                </option>
              ))}
            </select>
            <select
              value={trendMetricKey}
              onChange={(e) => setTrendMetricKey(e.target.value)}
              style={selectStyle}
            >
              {TREND_METRICS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              value={trendPeriodType}
              onChange={(e) => setTrendPeriodType(e.target.value as "FY" | "quarterly")}
              style={selectStyle}
            >
              <option value="FY">Annual (FY)</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </div>
        }
      >
        {trendData.length === 0 ? (
          <p style={{ fontSize: "0.85rem", color: T.inkSoft }}>
            {trendWorkspace?.company_name ?? "This company"} has no{" "}
            {trendPeriodType === "FY" ? "annual" : "quarterly"} records for this metric yet.
          </p>
        ) : (
          <TrendLineChart data={trendData} isRatio={trendMetric.unit === "pp"} />
        )}
      </Schedule>
    </div>
  );
}
