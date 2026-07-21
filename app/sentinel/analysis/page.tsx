"use client";
export const dynamic = "force-dynamic";

// Sentinel — Deep Analysis. The analyst's drill-down view: peer
// comparison across the sector, and trend over time for whichever
// company has quarterly-granularity data. Read-only — no API calls,
// no review actions, straight off the engine's peer table.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { HorizontalBarChart, TrendLineChart } from "../lib/charts";
import { buildPeerTable } from "../lib/engine";
import { SERIF, T } from "../lib/theme";
import type { FinancialStatement, PeerRow } from "../lib/types";

const PEER_METRICS: { label: string; key: string; isRatio: boolean }[] = [
  { label: "Revenue (₹ cr)", key: "revenue_cr", isRatio: false },
  { label: "PAT (₹ cr)", key: "pat_cr", isRatio: false },
  { label: "EBITDA margin", key: "ebitda_margin", isRatio: true },
  { label: "PAT margin", key: "pat_margin", isRatio: true },
  { label: "YoY PAT growth", key: "yoy_pat_growth", isRatio: true },
];

const TREND_METRICS: { label: string; key: "revenue_from_operations" | "profit_after_tax" | "ebitda_margin"; isRatio: boolean }[] = [
  { label: "Revenue (₹ cr)", key: "revenue_from_operations", isRatio: false },
  { label: "PAT (₹ cr)", key: "profit_after_tax", isRatio: false },
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
  const [statements, setStatements] = useState<FinancialStatement[]>([]);
  const [peerMetricKey, setPeerMetricKey] = useState(PEER_METRICS[0].key);
  const [trendCompany, setTrendCompany] = useState<string | null>(null);
  const [trendMetricKey, setTrendMetricKey] = useState(TREND_METRICS[1].key);

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push("/login");
        return;
      }
      const { data, error: fetchError } = await supabase
        .from("sentinel_statements")
        .select("*");
      if (fetchError) {
        setError(fetchError.message);
      } else {
        setStatements((data ?? []) as FinancialStatement[]);
      }
      setLoading(false);
    })();
  }, [router]);

  if (loading) return <p style={{ color: T.inkSoft }}>Loading Sentinel…</p>;
  if (error) return <p style={{ color: T.ink }}>Could not load data: {error}</p>;

  const peerRows = buildPeerTable(statements, "FY");
  const peerMetric = PEER_METRICS.find((m) => m.key === peerMetricKey)!;
  const barData = peerRows
    .map((r) => ({ label: r.company_name, value: peerValue(r, peerMetricKey) }))
    .filter((d): d is { label: string; value: number } => d.value != null);

  const quarterly = statements.filter((s) =>
    ["Q1", "Q2", "Q3", "Q4"].includes(s.period_type)
  );
  const trendCompanies = [...new Set(quarterly.map((s) => s.company_id))].sort();
  const activeCompany = trendCompany ?? trendCompanies[0] ?? null;
  const companyName =
    statements.find((s) => s.company_id === activeCompany)?.company_name ?? "";

  const trendMetric = TREND_METRICS.find((m) => m.key === trendMetricKey)!;
  const companyQuarters = quarterly
    .filter((s) => s.company_id === activeCompany)
    .sort((a, b) => a.period_end_date.localeCompare(b.period_end_date));
  const trendData = companyQuarters
    .map((s) => {
      let value: number | null;
      if (trendMetric.key === "ebitda_margin") {
        value = s.ebitda != null && s.revenue_from_operations !== 0
          ? s.ebitda / s.revenue_from_operations
          : null;
      } else {
        value = s[trendMetric.key];
      }
      return { label: s.period_label, value };
    })
    .filter((d): d is { label: string; value: number } => d.value != null);

  const showBalkrishnaCaption =
    activeCompany === "balkrishna" && trendMetric.key === "profit_after_tax";

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
          margin: "0.45rem 0 1.6rem 0",
        }}
      >
        Peer comparison and trend — read-only, no review actions here
      </p>

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
          Absolute figures (revenue, PAT) are not directly comparable across standalone vs.
          consolidated companies — see the basis caveat below the chart.
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
        <HorizontalBarChart data={barData} isRatio={peerMetric.isRatio} />
        {peerRows.some((r) => r.basis_caveat) && (
          <p style={{ fontSize: "0.75rem", color: T.inkSoft, marginTop: "1rem" }}>
            {peerRows
              .filter((r) => r.basis_caveat)
              .map((r) => `${r.company_name}: ${r.basis_caveat}`)
              .join(" · ")}
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
        {trendCompanies.length === 0 ? (
          <p style={{ fontSize: "0.85rem", color: T.inkSoft }}>
            No company in the current dataset has quarterly-granularity records yet.
          </p>
        ) : (
          <>
            <div style={{ display: "flex", gap: "0.7rem", marginBottom: "1.2rem" }}>
              <select
                value={activeCompany ?? ""}
                onChange={(e) => setTrendCompany(e.target.value)}
                style={selectStyle}
              >
                {trendCompanies.map((id) => (
                  <option key={id} value={id}>
                    {statements.find((s) => s.company_id === id)?.company_name ?? id}
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
                {companyName}&apos;s PAT held up through Q1–Q2, then declined in Q3–Q4 —
                consistent with the FY26 YoY decline flagged in the Review Queue.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
