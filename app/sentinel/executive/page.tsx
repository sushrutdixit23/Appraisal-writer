"use client";
export const dynamic = "force-dynamic";

// Sentinel — Executive Dashboard, rebuilt around workspace_id and
// sentinel_investigations. Still strictly approved-output-only: an
// investigation appears here only once a human has signed off,
// regardless of how confident the draft narrative or computed
// confidence score reads.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { buildPeerTable } from "../lib/engine";
import { parseVerdict } from "../lib/format";
import { SERIF, T } from "../lib/theme";
import type { FinancialStatement, Investigation, Workspace } from "../lib/types";

export default function ExecutiveDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [statements, setStatements] = useState<FinancialStatement[]>([]);
  const [investigations, setInvestigations] = useState<Investigation[]>([]);

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push("/login");
        return;
      }
      const [wsRes, invRes] = await Promise.all([
        supabase.from("sentinel_workspaces").select("*"),
        supabase.from("sentinel_investigations").select("*"),
      ]);
      if (wsRes.error) {
        setError(wsRes.error.message);
        setLoading(false);
        return;
      }
      const ws = (wsRes.data ?? []) as Workspace[];
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
      if (!invRes.error) {
        setInvestigations((invRes.data ?? []) as Investigation[]);
      }
      setLoading(false);
    })();
  }, [router]);

  if (loading) return <p style={{ color: T.inkSoft }}>Loading Sentinel…</p>;
  if (error) return <p style={{ color: T.ink }}>Could not load data: {error}</p>;

  const wsById = new Map(workspaces.map((w) => [w.id, w]));
  const bySector = new Map<string, Workspace[]>();
  for (const w of workspaces) {
    if (!bySector.has(w.sector)) bySector.set(w.sector, []);
    bySector.get(w.sector)!.push(w);
  }
  const growthByWorkspace = new Map<string, number | null>();
  for (const [sector, sectorWs] of bySector) {
    if (sectorWs.length === 0) continue;
    const rows = buildPeerTable(sectorWs, statements, sectorWs[0].id, "FY");
    for (const row of rows) {
      growthByWorkspace.set(row.workspace_id, row.ratios.yoy_pat_growth ?? null);
    }
  }

  const approved = investigations.filter((i) => i.status === "approved" || i.status === "edited");
  const withGrowth = approved.map((inv) => {
    const growth = growthByWorkspace.get(inv.workspace_id) ?? null;
    return { inv, absGrowth: growth != null ? Math.abs(growth) : 0, growth };
  });
  withGrowth.sort((a, b) => b.absGrowth - a.absGrowth);

  const totalCompanies = new Set(statements.filter((s) => s.period_type === "FY").map((s) => s.workspace_id)).size;

  const stats: [string, number][] = [
    ["Companies in peer set", totalCompanies],
    ["Reviewed", investigations.length],
    ["Approved", approved.length],
    ["Awaiting review", Math.max(0, totalCompanies - investigations.length)],
  ];

  return (
    <div>
      <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0 }}>
        Executive Dashboard
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
        Approved findings only — every item here has a human sign-off
      </p>

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
        {stats.map(([label, value], i) => (
          <div key={label} style={{ background: T.card, padding: "1rem 1.25rem" }}>
            <p
              style={{
                fontSize: "0.64rem",
                fontWeight: 500,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: T.inkSoft,
                margin: "0 0 0.35rem 0",
              }}
            >
              {label}
            </p>
            <p
              style={{
                fontFamily: SERIF,
                fontSize: "1.8rem",
                fontWeight: 500,
                color: i === 2 ? T.accent : T.ink,
                margin: 0,
              }}
            >
              {value}
            </p>
          </div>
        ))}
      </div>

      {withGrowth.length === 0 ? (
        <p style={{ fontSize: "0.9rem", color: T.inkSoft }}>
          Nothing has been approved yet. Generate and approve investigations in the
          Investigation Queue — only signed-off findings ever appear here.
        </p>
      ) : (
        withGrowth.map(({ inv, growth }) => {
          const ws = wsById.get(inv.workspace_id);
          return (
            <div
              key={inv.id}
              style={{
                background: T.card,
                border: `1px solid ${T.rule}`,
                borderRadius: 3,
                padding: "1.6rem 1.9rem",
                marginBottom: "1.4rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: "1rem",
                }}
              >
                <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.2rem", margin: 0 }}>
                  {ws?.company_name ?? "Unknown company"}
                </h3>
                {growth != null && (
                  <span style={{ whiteSpace: "nowrap", fontSize: "0.85rem" }}>
                    <span style={{ fontWeight: 600 }}>
                      {growth > 0 ? "\u25b2" : "\u25bc"} {growth >= 0 ? "+" : ""}
                      {(growth * 100).toFixed(1)}%
                    </span>{" "}
                    <span style={{ color: T.inkSoft, fontSize: "0.78rem" }}>PAT YoY</span>
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", margin: "0.6rem 0 1rem 0" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: "0.68rem",
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    padding: "0.28rem 0.7rem",
                    border: `1px solid ${T.accent}`,
                    color: T.accent,
                  }}
                >
                  <span style={{ width: 5, height: 5, background: T.accent }} />
                  {inv.status === "edited" ? "Approved \u00b7 edited" : "Approved"}
                </span>
                {inv.confidence_score != null && (
                  <span style={{ fontSize: "0.75rem", color: T.inkSoft }}>
                    Confidence {inv.confidence_score}%
                  </span>
                )}
              </div>
              <p style={{ fontSize: "0.97rem", lineHeight: 1.65, whiteSpace: "pre-line", margin: 0 }}>
                {(() => {
                  const { verdict, body } = parseVerdict(inv.final_narrative);
                  return (
                    <>
                      {verdict && (
                        <span style={{ display: "block", fontFamily: SERIF, fontWeight: 600, fontSize: "1.02rem", color: T.ink, marginBottom: "0.4rem" }}>
                          {verdict}
                        </span>
                      )}
                      {body}
                    </>
                  );
                })()}
              </p>
            </div>
          );
        })
      )}
    </div>
  );
}
