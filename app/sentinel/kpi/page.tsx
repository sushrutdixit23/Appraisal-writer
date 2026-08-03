"use client";
export const dynamic = "force-dynamic";

// Sentinel — KPI Dashboard. The Intelligence Layer per the vision doc:
// computed metrics an analyst works with directly, not narrative. First
// page in the app to actually render charts.tsx (HorizontalBarChart,
// TrendLineChart) - those were built earlier but never wired up. Trend
// charts only get meaningfully better as more periods exist per company
// (see Add Period) - for a company with only one period on file, the
// trend chart legitimately shows a single point, which is expected, not
// a bug.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { HorizontalBarChart, TrendLineChart } from "../lib/charts";
import { buildPeerTable, buildTimeSeries, findPriorYear } from "../lib/engine";
import { getBenchmark, type Benchmark } from "../lib/benchmark";
import { computeHealthScore, type HealthCategory, type HealthStatus } from "../lib/health";
import { SERIF, T } from "../lib/theme";
import type { FinancialStatement, Workspace } from "../lib/types";

function KpiCard({ label, value, note }: { label: string; value: string; note?: string | null }) {
  return (
    <div style={{ background: T.card, padding: "1rem 1.1rem" }}>
      <p
        style={{
          fontSize: "0.62rem",
          fontWeight: 500,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: T.inkSoft,
          margin: "0 0 0.35rem 0",
        }}
      >
        {label}
      </p>
      <p style={{ fontFamily: SERIF, fontSize: "1.6rem", fontWeight: 500, color: T.ink, margin: 0 }}>
        {value}
      </p>
      {note && (
        <p style={{ fontSize: "0.68rem", color: T.inkSoft, margin: "0.35rem 0 0 0" }}>{note}</p>
      )}
    </div>
  );
}

const HEALTH_COLORS: Record<HealthStatus, { bg: string; text: string; statusLabel: string }> = {
  healthy: { bg: "#E8F0E3", text: "#2F5233", statusLabel: "Healthy" },
  watch: { bg: "#FBF0DC", text: "#8A6416", statusLabel: "Watch" },
  concern: { bg: "#FBE4D8", text: "#9A4A1F", statusLabel: "Concern" },
  critical: { bg: "#F6DCDC", text: "#8C2A2A", statusLabel: "Critical" },
  no_data: { bg: T.background, text: T.inkSoft, statusLabel: "No data" },
};

function HealthChip({ category }: { category: HealthCategory }) {
  const colors = HEALTH_COLORS[category.status];
  return (
    <div
      style={{ background: colors.bg, borderRadius: 3, padding: "0.7rem 0.8rem" }}
      title={category.detail ?? undefined}
    >
      <p
        style={{
          fontSize: "0.6rem",
          fontWeight: 500,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: colors.text,
          margin: "0 0 0.3rem 0",
        }}
      >
        {category.label}
      </p>
      <p style={{ fontSize: "0.85rem", fontWeight: 600, color: colors.text, margin: 0 }}>
        {colors.statusLabel}
      </p>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: T.card,
        border: `1px solid ${T.rule}`,
        borderRadius: 3,
        padding: "1.4rem 1.6rem",
        marginBottom: "1.4rem",
      }}
    >
      <p
        style={{
          fontSize: "0.7rem",
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: T.inkSoft,
          margin: subtitle ? "0 0 0.3rem 0" : "0 0 1rem 0",
        }}
      >
        {title}
      </p>
      {subtitle && (
        <p style={{ fontSize: "0.72rem", color: T.inkSoft, margin: "0 0 1rem 0" }}>{subtitle}</p>
      )}
      {children}
    </div>
  );
}

const pct = (v: number | null) => (v == null ? "\u2014" : `${(v * 100).toFixed(1)}%`);
const num = (v: number | null) =>
  v == null ? "\u2014" : v.toLocaleString("en-IN", { maximumFractionDigits: 0 });

function formatBenchmarkNote(b: Benchmark | null, isRatio: boolean): string | null {
  if (!b || !b.closestPeer || b.gapToClosestPeer == null) return null;
  const sign = b.gapToClosestPeer >= 0 ? "+" : "";
  const gap = isRatio
    ? `${sign}${(b.gapToClosestPeer * 100).toFixed(1)}pp`
    : `${sign}${b.gapToClosestPeer.toLocaleString("en-IN", { maximumFractionDigits: 0 })} cr`;
  return `vs ${b.closestPeer.company_name}: ${gap}`;
}

function formatIndustryLine(b: Benchmark | null, isRatio: boolean): string | null {
  if (!b || b.industryAverage == null || !b.industryLeader) return null;
  const fmt = (v: number) =>
    isRatio ? `${(v * 100).toFixed(1)}%` : v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return `Industry avg ${fmt(b.industryAverage)} \u00b7 Leader ${b.industryLeader.company_name} (${fmt(
    b.industryLeader.value
  )})`;
}

export default function KpiDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [statements, setStatements] = useState<FinancialStatement[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");

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
      if (ws.length > 0) setSelectedId(ws[0].id);

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

  if (loading) return <p style={{ color: T.inkSoft }}>Loading Sentinel…</p>;
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
  const sectorPeers = workspaces.filter((w) => w.sector === selected.sector);
  const peerRows = buildPeerTable(sectorPeers, statements, selected.id, "FY");
  const selfRow = peerRows.find((r) => r.is_subject) ?? null;

  const revenueData = peerRows.map((r) => ({ label: r.company_name, value: r.revenue_cr }));
  const patMarginData = peerRows
    .filter((r) => r.ratios.pat_margin != null)
    .map((r) => ({ label: r.company_name, value: r.ratios.pat_margin as number }));
  const ebitdaMarginData = peerRows
    .filter((r) => r.ratios.ebitda_margin != null)
    .map((r) => ({ label: r.company_name, value: r.ratios.ebitda_margin as number }));

  const revenueBenchmark = getBenchmark(peerRows, selected.id, "revenue_cr");
  const ebitdaBenchmark = getBenchmark(peerRows, selected.id, "ebitda_margin");
  const patBenchmark = getBenchmark(peerRows, selected.id, "pat_margin");
  const yoyBenchmark = getBenchmark(peerRows, selected.id, "yoy_revenue_growth");

  const ownFYStatements = statements
    .filter((s) => s.workspace_id === selected.id && s.period_type === "FY")
    .sort((a, b) => a.period_end_date.localeCompare(b.period_end_date));
  const latestOwnStatement = ownFYStatements[ownFYStatements.length - 1] ?? null;
  const priorOwnStatement = latestOwnStatement
    ? findPriorYear(latestOwnStatement, statements)
    : null;
  const healthScore = latestOwnStatement
    ? computeHealthScore(latestOwnStatement, priorOwnStatement, selected.sector)
    : null;

  const revenueTrend = buildTimeSeries(selected, statements, "revenue_from_operations");
  const patTrend = buildTimeSeries(selected, statements, "profit_after_tax");

  return (
    <div>
      <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0 }}>
        KPI Dashboard
      </h1>
      <p
        style={{
          fontSize: "0.7rem",
          fontWeight: 500,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: T.inkSoft,
          margin: "0.45rem 0 1.2rem 0",
        }}
      >
        Computed metrics, not narrative — every figure here traces to the underlying statement
      </p>

      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        style={{
          fontFamily: "inherit",
          fontSize: "0.9rem",
          padding: "0.5rem 0.8rem",
          border: `1px solid ${T.rule}`,
          borderRadius: 3,
          background: T.card,
          color: T.ink,
          marginBottom: "1.6rem",
        }}
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.company_name}
          </option>
        ))}
      </select>

      {healthScore && (
        <div
          style={{
            background: T.card,
            border: `1px solid ${T.rule}`,
            borderRadius: 3,
            padding: "1.4rem 1.6rem",
            marginBottom: "1.75rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.7rem", marginBottom: "1rem" }}>
            <p
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: T.inkSoft,
                margin: 0,
              }}
            >
              Business Health
            </p>
            <span
              style={{
                fontSize: "0.78rem",
                fontWeight: 600,
                color: HEALTH_COLORS[healthScore.overall].text,
                background: HEALTH_COLORS[healthScore.overall].bg,
                borderRadius: 3,
                padding: "0.15rem 0.55rem",
              }}
            >
              Overall: {HEALTH_COLORS[healthScore.overall].statusLabel}
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "0.6rem",
            }}
          >
            {healthScore.categories.map((c) => (
              <HealthChip key={c.key} category={c} />
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 1,
          background: T.rule,
          border: `1px solid ${T.rule}`,
          marginBottom: "1.75rem",
        }}
      >
        <KpiCard
          label="Revenue (latest FY)"
          value={selfRow ? num(selfRow.revenue_cr) : "\u2014"}
          note={formatBenchmarkNote(revenueBenchmark, false)}
        />
        <KpiCard
          label="EBITDA margin"
          value={pct(selfRow?.ratios.ebitda_margin ?? null)}
          note={formatBenchmarkNote(ebitdaBenchmark, true)}
        />
        <KpiCard
          label="PAT margin"
          value={pct(selfRow?.ratios.pat_margin ?? null)}
          note={formatBenchmarkNote(patBenchmark, true)}
        />
        <KpiCard
          label="Revenue YoY"
          value={pct(selfRow?.ratios.yoy_revenue_growth ?? null)}
          note={formatBenchmarkNote(yoyBenchmark, true)}
        />
      </div>

      <ChartCard title={"Revenue trend \u2014 " + selected.company_name}>
        <TrendLineChart data={revenueTrend} isRatio={false} />
      </ChartCard>

      <ChartCard title={"PAT trend \u2014 " + selected.company_name}>
        <TrendLineChart data={patTrend} isRatio={false} />
      </ChartCard>

      <ChartCard title="Revenue vs. peers (latest FY)" subtitle={formatIndustryLine(revenueBenchmark, false)}>
        <HorizontalBarChart data={revenueData} isRatio={false} highlightLabel={selected.company_name} />
      </ChartCard>

      <ChartCard title="EBITDA margin vs. peers" subtitle={formatIndustryLine(ebitdaBenchmark, true)}>
        <HorizontalBarChart data={ebitdaMarginData} isRatio={true} highlightLabel={selected.company_name} />
      </ChartCard>

      <ChartCard title="PAT margin vs. peers" subtitle={formatIndustryLine(patBenchmark, true)}>
        <HorizontalBarChart data={patMarginData} isRatio={true} highlightLabel={selected.company_name} />
      </ChartCard>
    </div>
  );
}
