"use client";
export const dynamic = "force-dynamic";

// Sentinel - Deep Analysis. Rebuilt to close the gap with KPI Dashboard:
// the metric coverage here had fallen behind (5 peer metrics, 3 trend
// metrics, vs KPI Dashboard's 12), and the Trend section only worked
// for companies with quarterly-granularity data - which is most likely
// nobody in a dataset built primarily on annual filings, since nothing
// here ever fell back to FY periods. Both are fixed below. The
// hardcoded "Balkrishna Industries Ltd" caption (a literal company-name
// string match) has also been removed - it never generalized to any
// other company and had no place in a real product.
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

// Same 12-metric coverage as KPI Dashboard's KPI cards, using the same
// "pp"/"cr"/"x"/"d" unit system (see formatBenchmarkNote/
// formatIndustryLine below) rather than the old binary isRatio flag,
// which could not correctly label ratio ("x") or day-count ("d")
// metrics. direction feeds getBenchmark's peer-comparison logic
// (whether a higher or lower value is the "better" one) - same
// direction choices already used for these exact metrics on KPI
// Dashboard, not new judgment calls made here.
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
  { label: "Current Ratio", key: "current_ratio", unit: "x", direction: "higher_is_better" },
  { label: "Debt-to-Equity", key: "debt_to_equity", unit: "x", direction: "lower_is_better" },
  { label: "Inventory Days", key: "inventory_days", unit: "d", direction: "lower_is_better" },
  { label: "Receivable Days", key: "receivable_days", unit: "d", direction: "lower_is_better" },
  { label: "Payable Days", key: "payable_days", unit: "d", direction: "higher_is_better" },
  { label: "Cash Conversion Cycle", key: "cash_conversion_cycle", unit: "d", direction: "lower_is_better" },
];

// Same 12 metrics as PEER_METRICS, but keyed for buildTimeSeries/
// computeRatios instead of PeerRow - the three absolute figures use
// FinancialStatement's own raw field names (revenue_from_operations,
// profit_after_tax) rather than PeerRow's renamed ones (revenue_cr,
// pat_cr). Every ratio id below is identical in both lists, since
// PeerRow.ratios and computeRatios() both come from the same
// config.ts DERIVED_RATIOS.
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
  { label: "Current Ratio", key: "current_ratio", unit: "x" },
  { label: "Debt-to-Equity", key: "debt_to_equity", unit: "x" },
  { label: "Inventory Days", key: "inventory_days", unit: "d" },
  { label: "Receivable Days", key: "receivable_days", unit: "d" },
  { label: "Payable Days", key: "payable_days", unit: "d" },
  { label: "Cash Conversion Cycle", key: "cash_conversion_cycle", unit: "d" },
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
  return `Industry avg ${fmt(b.industryAverage)} - Leader ${b.industryLeader.company_name} (${fmt(
    b.industryLeader.value
  )})`;
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
  // "Viewing as" should let you pick ANY company, not just ones sharing
  // the currently-selected company's sector - sectorWorkspaces stays
  // scoped (used for the actual peer comparison below), this is only
  // for the selector itself.
  const allWorkspacesSorted = [...workspaces].sort((a, b) =>
    a.company_name.localeCompare(b.company_name)
  );
  const peerRows = buildPeerTable(sectorWorkspaces, statements, subjectId, "FY");
  const peerMetric = PEER_METRICS.find((m) => m.key === peerMetricKey)!;
  const peerBenchmark = getBenchmark(peerRows, subjectId, peerMetricKey, peerMetric.direction);
  const barData = peerRows
    .map((r) => ({ label: r.company_name, value: peerValue(r, peerMetricKey) }))
    .filter((d): d is { label: string; value: number } => d.value != null);

  // Trend has its own independent company selector (defaults to
  // whichever company "Viewing as" has selected, but can be changed
  // separately) - lets you compare Peer Comparison for one company
  // against Trend for another at the same time.
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
      <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0 }}>
        Deep Analysis
      </h1>
      <p
        style={{
          fontSize: "0.7rem",
          fontWeight: 500,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: T.inkSoft,
          margin: "0.45rem 0 1rem 0",
        }}
      >
        Peer comparison and trend - read-only, no review actions here
      </p>

      <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <label style={{ fontSize: "0.7rem", color: T.inkSoft, marginRight: "0.6rem" }}>Viewing as</label>
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
          style={{ fontSize: "0.78rem", color: T.accent, textDecoration: "none" }}
        >
          View Investigations for {subjectWorkspace.company_name} &gt;
        </a>
      </div>

      <section
        style={{
          background: T.card,
          border: `1px solid ${T.rule}`,
          borderRadius: 3,
          padding: "1.5rem 1.7rem",
          marginBottom: "1.5rem",
        }}
      >
        <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.1rem", margin: "0 0 0.3rem 0" }}>
          Peer comparison - FY26
        </h3>
        <p style={{ fontSize: "0.8rem", color: T.inkSoft, margin: "0 0 1rem 0" }}>
          {subjectWorkspace.company_name}&apos;s bar is highlighted. Absolute figures (revenue, PAT) are
          not directly comparable across standalone vs. consolidated companies - see the basis caveat below.
        </p>
        <select
          value={peerMetricKey}
          onChange={(e) => setPeerMetricKey(e.target.value)}
          style={{ ...selectStyle, marginBottom: "1.2rem" }}
        >
          {PEER_METRICS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        {(formatBenchmarkNote(peerBenchmark, peerMetric.unit) ||
          formatIndustryLine(peerBenchmark, peerMetric.unit)) && (
          <p style={{ fontSize: "0.78rem", color: T.inkSoft, margin: "-0.6rem 0 1rem 0" }}>
            {[
              formatBenchmarkNote(peerBenchmark, peerMetric.unit),
              formatIndustryLine(peerBenchmark, peerMetric.unit),
            ]
              .filter(Boolean)
              .join(" - ")}
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
      </section>

      <section
        style={{
          background: T.card,
          border: `1px solid ${T.rule}`,
          borderRadius: 3,
          padding: "1.5rem 1.7rem",
        }}
      >
        <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.1rem", margin: "0 0 1rem 0" }}>
          Trend over time
        </h3>
        <div style={{ display: "flex", gap: "0.7rem", marginBottom: "1.2rem", flexWrap: "wrap" }}>
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
        {trendData.length === 0 ? (
          <p style={{ fontSize: "0.85rem", color: T.inkSoft }}>
            {trendWorkspace?.company_name ?? "This company"} has no{" "}
            {trendPeriodType === "FY" ? "annual" : "quarterly"} records for this metric yet.
          </p>
        ) : (
          <TrendLineChart data={trendData} isRatio={trendMetric.unit === "pp"} />
        )}
      </section>
    </div>
  );
}
