"use client";
export const dynamic = "force-dynamic";

// Sentinel — Deep Analysis, rebuilt around workspace_id. Adds a real
// "Viewing as" workspace selector, which now genuinely controls which
// bar gets highlighted in the peer chart (is_subject is call-time now,
// not a hardcoded flag — see engine.ts). Read-only, no review actions.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { HorizontalBarChart, TrendLineChart } from "../lib/charts";
import { buildPeerTable } from "../lib/engine";
import { SERIF, T } from "../lib/theme";
import type { FinancialStatement, PeerRow, Workspace } from "../lib/types";

const PEER_METRICS: { label: string; key: string; isRatio: boolean }[] = [
  { label: "Revenue (\u20b9 cr)", key: "revenue_cr", isRatio: false },
  { label: "PAT (\u20b9 cr)", key: "pat_cr", isRatio: false },
  { label: "EBITDA margin", key: "ebitda_margin", isRatio: true },
  { label: "PAT margin", key: "pat_margin", isRatio: true },
  { label: "YoY PAT growth", key: "yoy_pat_growth", isRatio: true },
];

const TREND_METRICS: {
  label: string;
  key: "revenue_from_operations" | "profit_after_tax" | "ebitda_margin";
  isRatio: boolean;
}[] = [
  { label: "Revenue (\u20b9 cr)", key: "revenue_from_operations", isRatio: false },
  { label: "PAT (\u20b9 cr)", key: "profit_after_tax", isRatio: false },
  { label: "EBITDA margin", key: "ebitda_margin", isRatio: true },
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

  if (loading) return <p style={{ color: T.inkSoft }}>Loading Sentinel…</p>;
  if (error) return <p style={{ color: T.ink }}>Could not load data: {error}</p>;
  if (workspaces.length === 0 || !subjectId) {
    return <p style={{ color: T.inkSoft }}>No workspaces available yet.</p>;
  }

  const subjectWorkspace = workspaces.find((w) => w.id === subjectId)!;
  const sectorWorkspaces = workspaces.filter((w) => w.sector === subjectWorkspace.sector);
  const peerRows = buildPeerTable(sectorWorkspaces, statements, subjectId, "FY");
  const peerMetric = PEER_METRICS.find((m) => m.key === peerMetricKey)!;
  const barData = peerRows
    .map((r) => ({ label: r.company_name, value: peerValue(r, peerMetricKey) }))
    .filter((d): d is { label: string; value: number } => d.value != null);

  const quarterly = statements.filter((s) => ["Q1", "Q2", "Q3", "Q4"].includes(s.period_type));
  const trendWorkspaces = [...new Set(quarterly.map((s) => s.workspace_id))]
    .map((id) => workspaces.find((w) => w.id === id))
    .filter((w): w is Workspace => w != null)
    .sort((a, b) => a.company_name.localeCompare(b.company_name));
  const activeTrendId = trendWorkspaceId ?? trendWorkspaces[0]?.id ?? null;
  const trendWorkspace = workspaces.find((w) => w.id === activeTrendId);

  const trendMetric = TREND_METRICS.find((m) => m.key === trendMetricKey)!;
  const companyQuarters = quarterly
    .filter((s) => s.workspace_id === activeTrendId)
    .sort((a, b) => a.period_end_date.localeCompare(b.period_end_date));
  const trendData = companyQuarters
    .map((s) => {
      let value: number | null;
      if (trendMetric.key === "ebitda_margin") {
        value =
          s.ebitda != null && s.revenue_from_operations !== 0
            ? s.ebitda / s.revenue_from_operations
            : null;
      } else {
        value = s[trendMetric.key];
      }
      return { label: s.period_label, value };
    })
    .filter((d): d is { label: string; value: number } => d.value != null);

  const showBalkrishnaCaption =
    trendWorkspace?.company_name === "Balkrishna Industries Ltd" && trendMetric.key === "profit_after_tax";

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
        Peer comparison and trend — read-only, no review actions here
      </p>

      <div style={{ marginBottom: "1.5rem" }}>
        <label style={{ fontSize: "0.7rem", color: T.inkSoft, marginRight: "0.6rem" }}>Viewing as</label>
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} style={selectStyle}>
          {sectorWorkspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.company_name}
            </option>
          ))}
        </select>
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
          Peer comparison — FY26
        </h3>
        <p style={{ fontSize: "0.8rem", color: T.inkSoft, margin: "0 0 1rem 0" }}>
          {subjectWorkspace.company_name}&apos;s bar is highlighted. Absolute figures (revenue, PAT) are
          not directly comparable across standalone vs. consolidated companies — see the basis caveat below.
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
        <HorizontalBarChart data={barData} isRatio={peerMetric.isRatio} highlightLabel={subjectWorkspace.company_name} />
        {peerRows.some((r) => r.basis_caveat) && (
          <p style={{ fontSize: "0.75rem", color: T.inkSoft, marginTop: "1rem" }}>
            {peerRows
              .filter((r) => r.basis_caveat)
              .map((r) => `${r.company_name}: ${r.basis_caveat}`)
              .join(" \u00b7 ")}
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
        {trendWorkspaces.length === 0 ? (
          <p style={{ fontSize: "0.85rem", color: T.inkSoft }}>
            No company in the current dataset has quarterly-granularity records yet.
          </p>
        ) : (
          <>
            <div style={{ display: "flex", gap: "0.7rem", marginBottom: "1.2rem" }}>
              <select
                value={activeTrendId ?? ""}
                onChange={(e) => setTrendWorkspaceId(e.target.value)}
                style={selectStyle}
              >
                {trendWorkspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.company_name}
                  </option>
                ))}
              </select>
              <select
                value={trendMetricKey}
                onChange={(e) => setTrendMetricKey(e.target.value as typeof trendMetricKey)}
                style={selectStyle}
              >
                {TREND_METRICS.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <TrendLineChart data={trendData} isRatio={trendMetric.isRatio} />
            {showBalkrishnaCaption && (
              <p style={{ fontSize: "0.8rem", color: T.inkSoft, marginTop: "0.8rem" }}>
                Balkrishna&apos;s PAT held up through Q1–Q2, then declined in Q3–Q4 —
                consistent with the FY26 YoY decline flagged in the Investigation Queue.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
