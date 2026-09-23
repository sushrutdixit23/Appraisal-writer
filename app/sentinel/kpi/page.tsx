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
// charts.tsx (HorizontalBarChart, TrendLineChart) is untouched - only
// how this page wraps them changed. Trend charts only get meaningfully
// better as more periods exist per company (see Add Period) - for a
// company with only one period on file, the trend chart legitimately
// shows a single point, which is expected, not a bug.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { HorizontalBarChart, TrendLineChart } from "../lib/charts";
import { buildPeerTable, buildTimeSeries, findPriorYear } from "../lib/engine";
import { getBenchmark, getMetricValue, type Benchmark } from "../lib/benchmark";
import { computeHealthScore, type HealthCategory, type HealthScore, type HealthStatus } from "../lib/health";
import { SERIF, T } from "../lib/theme";
import type { FinancialStatement, PeerRow, Workspace } from "../lib/types";

const pct = (v: number | null) => (v == null ? "-" : `${(v * 100).toFixed(1)}%`);
const num = (v: number | null) =>
  v == null ? "-" : v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const days = (v: number | null) => (v == null ? "-" : `${v.toFixed(0)}d`);
const ratioX = (v: number | null) => (v == null ? "-" : `${v.toFixed(2)}x`);

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

function formatByUnit(v: number, unit: "pp" | "cr" | "x" | "d"): string {
  if (unit === "pp") return `${(v * 100).toFixed(1)}%`;
  if (unit === "x") return `${v.toFixed(2)}x`;
  if (unit === "d") return `${v.toFixed(0)}d`;
  return v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
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

// Generalized version of the old hardcoded revenueData/patMarginData/
// ebitdaMarginData builders - drives the Peer Standing bar chart off
// whichever metric is currently selected, using the same getMetricValue
// extraction computeRank and getBenchmark already use.
function buildBarData(rows: PeerRow[], metric: string): { label: string; value: number }[] {
  return rows
    .map((r) => ({ label: r.company_name, value: getMetricValue(r, metric) }))
    .filter((d): d is { label: string; value: number } => d.value != null);
}

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
];

const HEALTH_COLORS: Record<HealthStatus, { text: string; statusLabel: string }> = {
  healthy: { text: "#2F5233", statusLabel: "Healthy" },
  watch: { text: "#8A6416", statusLabel: "Watch" },
  concern: { text: "#9A4A1F", statusLabel: "Concern" },
  critical: { text: "#8C2A2A", statusLabel: "Critical" },
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

function StatFigure({
  label,
  value,
  note,
  formula,
}: {
  label: string;
  value: string;
  note?: string | null;
  formula?: string;
}) {
  return (
    <div style={{ background: T.card, padding: "1rem 1.1rem" }} title={formula}>
      <p style={{ fontSize: "0.74rem", color: T.inkSoft, margin: "0 0 0.35rem 0" }}>{label}</p>
      <p style={{ fontFamily: SERIF, fontSize: "1.5rem", fontWeight: 500, color: T.ink, margin: 0 }}>
        {value}
      </p>
      {note && <p style={{ fontSize: "0.68rem", color: T.inkSoft, margin: "0.35rem 0 0 0" }}>{note}</p>}
    </div>
  );
}

function HealthRow({ category, isLast }: { category: HealthCategory; isLast: boolean }) {
  const colors = HEALTH_COLORS[category.status];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.6rem 0",
        borderBottom: isLast ? "none" : `1px solid ${T.rule}`,
      }}
      title={category.detail ?? undefined}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: colors.text, flexShrink: 0 }} />
        <span style={{ fontSize: "0.9rem", color: T.ink }}>{category.label}</span>
      </div>
      <span style={{ fontSize: "0.84rem", fontWeight: 600, color: colors.text }}>{colors.statusLabel}</span>
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
  const [error, setError] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [statements, setStatements] = useState<FinancialStatement[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
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
        body: JSON.stringify({ workspace_id: selected.id }),
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
        body: JSON.stringify({ workspace_id: selected.id }),
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
  const rankingBarData = buildBarData(peerRows, rankingDef.metric);

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
  const latestOwnStatement = ownFYStatements[ownFYStatements.length - 1] ?? null;
  const priorOwnStatement = latestOwnStatement ? findPriorYear(latestOwnStatement, statements) : null;
  const healthScore = latestOwnStatement
    ? computeHealthScore(latestOwnStatement, priorOwnStatement, selected.sector)
    : null;
  const quickSummary = healthScore ? buildQuickSummary(healthScore) : null;

  const revenueTrend = buildTimeSeries(selected, statements, "revenue_from_operations");
  const patTrend = buildTimeSeries(selected, statements, "profit_after_tax");

  const debt = latestOwnStatement?.total_debt ?? null;
  const equity = latestOwnStatement?.total_equity ?? null;
  const capitalTotal = debt != null && equity != null ? debt + equity : null;
  const hasCapitalData = debt != null && equity != null && capitalTotal != null && capitalTotal > 0;
  const debtPct = hasCapitalData ? ((debt as number) / (capitalTotal as number)) * 100 : 0;
  const equityPct = hasCapitalData ? 100 - debtPct : 0;

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
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={selectStyle}>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.company_name}
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
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 1,
            background: T.rule,
            border: `1px solid ${T.rule}`,
          }}
        >
          <StatFigure
            label="Revenue (latest FY)"
            value={selfRow ? num(selfRow.revenue_cr) : "-"}
            note={formatBenchmarkNote(revenueBenchmark, "cr")}
            formula="As reported: Revenue from Operations"
          />
          <StatFigure
            label="EBITDA margin"
            value={pct(selfRow?.ratios.ebitda_margin ?? null)}
            note={formatBenchmarkNote(ebitdaBenchmark, "pp")}
            formula="EBITDA / Revenue from Operations"
          />
          <StatFigure
            label="PAT margin"
            value={pct(selfRow?.ratios.pat_margin ?? null)}
            note={formatBenchmarkNote(patBenchmark, "pp")}
            formula="Profit After Tax / Revenue from Operations"
          />
          <StatFigure
            label="Revenue YoY"
            value={pct(selfRow?.ratios.yoy_revenue_growth ?? null)}
            note={formatBenchmarkNote(yoyBenchmark, "pp")}
            formula="(Current Revenue - Prior Revenue) / Prior Revenue"
          />
          <StatFigure
            label="PAT (latest FY)"
            value={selfRow ? num(selfRow.pat_cr) : "-"}
            note={formatBenchmarkNote(patAbsBenchmark, "cr")}
            formula="As reported: Profit After Tax"
          />
          <StatFigure
            label="PAT YoY"
            value={pct(selfRow?.ratios.yoy_pat_growth ?? null)}
            note={formatBenchmarkNote(patYoyBenchmark, "pp")}
            formula="(Current PAT - Prior PAT) / Prior PAT"
          />
          <StatFigure
            label="Current ratio"
            value={ratioX(selfRow?.ratios.current_ratio ?? null)}
            note={formatBenchmarkNote(currentRatioBenchmark, "x")}
            formula="Current Assets / Current Liabilities"
          />
          <StatFigure
            label="Debt-to-equity"
            value={ratioX(selfRow?.ratios.debt_to_equity ?? null)}
            note={formatBenchmarkNote(debtEquityBenchmark, "x")}
            formula="Total Debt / Total Equity"
          />
          <StatFigure
            label="Inventory days"
            value={days(selfRow?.ratios.inventory_days ?? null)}
            note={formatBenchmarkNote(inventoryDaysBenchmark, "d")}
            formula="(Inventory / Total Expenses) x 365 - Total Expenses used as a COGS proxy"
          />
          <StatFigure
            label="Receivable days"
            value={days(selfRow?.ratios.receivable_days ?? null)}
            note={formatBenchmarkNote(receivableDaysBenchmark, "d")}
            formula="(Trade Receivables / Revenue from Operations) x 365"
          />
          <StatFigure
            label="Payable days"
            value={days(selfRow?.ratios.payable_days ?? null)}
            note={formatBenchmarkNote(payableDaysBenchmark, "d")}
            formula="(Trade Payables / Total Expenses) x 365 - Total Expenses used as a COGS proxy"
          />
          <StatFigure
            label="Cash conversion cycle"
            value={days(selfRow?.ratios.cash_conversion_cycle ?? null)}
            note={formatBenchmarkNote(cccBenchmark, "d")}
            formula="Inventory Days + Receivable Days - Payable Days"
          />
        </div>
      </Schedule>

      <Schedule
        title="Peer standing"
        subtitle={formatIndustryLine(rankingBenchmark, rankingDef.unit)}
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
            value={rankingBenchmark.percentile != null ? `${Math.round(rankingBenchmark.percentile)}th` : "-"}
          />
          <RankStat
            label="Closest peer"
            value={rankingBenchmark.closestPeer ? rankingBenchmark.closestPeer.company_name : "-"}
          />
          <RankStat
            label="Gap to closest peer"
            value={formatBenchmarkNote(rankingBenchmark, rankingDef.unit) ?? "-"}
          />
          <RankStat
            label="Industry leader"
            value={
              rankingBenchmark.industryLeader
                ? `${rankingBenchmark.industryLeader.company_name} (${formatByUnit(
                    rankingBenchmark.industryLeader.value,
                    rankingDef.unit
                  )})`
                : "-"
            }
          />
          <RankStat
            label="Industry average"
            value={
              rankingBenchmark.industryAverage != null
                ? formatByUnit(rankingBenchmark.industryAverage, rankingDef.unit)
                : "-"
            }
          />
        </div>
        <HorizontalBarChart
          data={rankingBarData}
          isRatio={rankingDef.unit === "pp"}
          highlightLabel={selected.company_name}
        />
      </Schedule>

      <Schedule title="Trend">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
          <div>
            <p style={{ fontSize: "0.78rem", color: T.inkSoft, margin: "0 0 0.8rem 0" }}>Revenue</p>
            <TrendLineChart data={revenueTrend} isRatio={false} />
          </div>
          <div>
            <p style={{ fontSize: "0.78rem", color: T.inkSoft, margin: "0 0 0.8rem 0" }}>Profit after tax</p>
            <TrendLineChart data={patTrend} isRatio={false} />
          </div>
        </div>
      </Schedule>

      <Schedule title="Capital structure">
        {hasCapitalData ? (
          <>
            <div style={{ display: "flex", height: "1.4rem", borderRadius: 3, overflow: "hidden", marginBottom: "0.5rem" }}>
              <div style={{ width: `${debtPct}%`, background: T.accent }} />
              <div style={{ width: `${equityPct}%`, background: T.rule }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: T.inkSoft, marginBottom: "1.3rem" }}>
              <span>Debt {debtPct.toFixed(0)}%</span>
              <span>Equity {equityPct.toFixed(0)}%</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
              <RankStat label="Total debt" value={num(debt)} />
              <RankStat label="Total equity" value={num(equity)} />
              <RankStat
                label="Debt-to-equity"
                value={ratioX(equity !== 0 ? (debt as number) / (equity as number) : null)}
              />
              <RankStat label="Debt-to-capital" value={pct((debt as number) / (capitalTotal as number))} />
            </div>
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
