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
import { buildPeerTable, buildTimeSeries } from "../lib/engine";
import { SERIF, T } from "../lib/theme";
import type { FinancialStatement, Workspace } from "../lib/types";

function KpiCard({ label, value }: { label: string; value: string }) {
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
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
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
          margin: "0 0 1rem 0",
        }}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

const pct = (v: number | null) => (v == null ? "\u2014" : `${(v * 100).toFixed(1)}%`);
const num = (v: number | null) =>
  v == null ? "\u2014" : v.toLocaleString("en-IN", { maximumFractionDigits: 0 });

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
        <KpiCard label="Revenue (latest FY)" value={selfRow ? num(selfRow.revenue_cr) : "\u2014"} />
        <KpiCard label="EBITDA margin" value={pct(selfRow?.ratios.ebitda_margin ?? null)} />
        <KpiCard label="PAT margin" value={pct(selfRow?.ratios.pat_margin ?? null)} />
        <KpiCard label="Revenue YoY" value={pct(selfRow?.ratios.yoy_revenue_growth ?? null)} />
      </div>

      <ChartCard title={"Revenue trend \u2014 " + selected.company_name}>
        <TrendLineChart data={revenueTrend} isRatio={false} />
      </ChartCard>

      <ChartCard title={"PAT trend \u2014 " + selected.company_name}>
        <TrendLineChart data={patTrend} isRatio={false} />
      </ChartCard>

      <ChartCard title="Revenue vs. peers (latest FY)">
        <HorizontalBarChart data={revenueData} isRatio={false} highlightLabel={selected.company_name} />
      </ChartCard>

      <ChartCard title="EBITDA margin vs. peers">
        <HorizontalBarChart data={ebitdaMarginData} isRatio={true} highlightLabel={selected.company_name} />
      </ChartCard>

      <ChartCard title="PAT margin vs. peers">
        <HorizontalBarChart data={patMarginData} isRatio={true} highlightLabel={selected.company_name} />
      </ChartCard>
    </div>
  );
}
