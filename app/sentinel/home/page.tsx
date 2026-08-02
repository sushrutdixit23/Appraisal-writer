"use client";
export const dynamic = "force-dynamic";

// Sentinel - Workspace Home. Landing screen showing what needs
// attention across ALL companies, not scoped to one workspace like
// every other page so far. New route (/sentinel/home) rather than
// replacing the existing /sentinel root (Investigation Queue) - that's
// a nav/routing decision for the layout file, not made here.
//
// Scoped to what's genuinely queryable today:
//   - Active review cycles (status != closed) across every company
//   - Pending investigation counts per company (real data - status is
//     already on sentinel_investigations regardless of review_cycle_id
//     wiring, so this doesn't depend on the still-open investigation-
//     generation gap noted elsewhere)
//   - The company list itself
//
// Deliberately NOT included, because the underlying data doesn't exist
// yet: Business Health Summary (Health Engine is Phase 2, unbuilt),
// Recently Uploaded Documents (extraction is ephemeral - no persistent
// document record), Upcoming Deadlines (Decision Tracker's due_date
// field exists in schema but no Decision Tracker UI exists to set one).
// Said plainly in a footer note rather than shown as empty placeholders
// that look like missing data instead of missing features.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { lifecycleLabel, periodTypeLabel } from "../lib/reviewCycle";
import { SERIF, T } from "../lib/theme";
import type { Investigation, ReviewCycle, Workspace } from "../lib/types";

const cardStyle: React.CSSProperties = {
  background: T.card,
  border: `1px solid ${T.rule}`,
  borderRadius: 3,
  padding: "1.1rem 1.4rem",
  marginBottom: "0.8rem",
};

const btnGhost: React.CSSProperties = {
  fontFamily: "inherit",
  fontSize: "0.85rem",
  fontWeight: 500,
  padding: "0.55rem 1.1rem",
  border: `1px solid ${T.ink}`,
  borderRadius: 3,
  background: "transparent",
  color: T.ink,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-block",
};

export default function WorkspaceHomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeCycles, setActiveCycles] = useState<(ReviewCycle & { company_name: string })[]>([]);
  const [pendingCountByWorkspace, setPendingCountByWorkspace] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push("/login");
        return;
      }

      const { data: wsData, error: wsError } = await supabase
        .from("sentinel_workspaces")
        .select("*")
        .eq("owner_id", sessionData.session.user.id);
      if (wsError) {
        setError(wsError.message);
        setLoading(false);
        return;
      }
      const ws = (wsData ?? []) as Workspace[];
      setWorkspaces(ws);

      if (ws.length === 0) {
        setLoading(false);
        return;
      }
      const wsIds = ws.map((w) => w.id);
      const wsNameById = new Map(ws.map((w) => [w.id, w.company_name]));

      const [{ data: cyclesData, error: cyclesError }, { data: invData, error: invError }] = await Promise.all([
        supabase
          .from("sentinel_review_cycles")
          .select("*")
          .in("workspace_id", wsIds)
          .neq("status", "closed")
          .order("opened_at", { ascending: false }),
        supabase
          .from("sentinel_investigations")
          .select("workspace_id")
          .in("workspace_id", wsIds)
          .eq("status", "pending"),
      ]);
      if (cyclesError) {
        setError(cyclesError.message);
      } else {
        const cycles = (cyclesData ?? []) as ReviewCycle[];
        setActiveCycles(
          cycles.map((c) => ({ ...c, company_name: wsNameById.get(c.workspace_id) ?? "Unknown company" }))
        );
      }
      if (!invError) {
        const counts: Record<string, number> = {};
        for (const row of invData ?? []) {
          counts[row.workspace_id] = (counts[row.workspace_id] ?? 0) + 1;
        }
        setPendingCountByWorkspace(counts);
      }
      setLoading(false);
    })();
  }, [router]);

  if (loading) return <p style={{ color: T.inkSoft }}>{"Loading Sentinel\u2026"}</p>;
  if (error) return <p style={{ color: T.ink }}>{`Could not load data: ${error}`}</p>;

  const totalPending = Object.values(pendingCountByWorkspace).reduce((a, b) => a + b, 0);

  return (
    <div>
      <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0 }}>
        Home
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
        {`What needs attention, across every company \u2014 ${workspaces.length} compan${workspaces.length === 1 ? "y" : "ies"}, ${activeCycles.length} active review${activeCycles.length === 1 ? "" : "s"}, ${totalPending} pending investigation${totalPending === 1 ? "" : "s"}`}
      </p>

      <div style={{ display: "flex", gap: "0.7rem", marginBottom: "2rem", flexWrap: "wrap" }}>
        <a href="/sentinel/new-project" style={btnGhost}>
          + New Project
        </a>
        <a href="/sentinel/add-period" style={btnGhost}>
          Add Period
        </a>
        <a href="/sentinel/reviews" style={btnGhost}>
          Review Cycles
        </a>
      </div>

      {workspaces.length === 0 ? (
        <p style={{ fontSize: "0.9rem", color: T.inkSoft }}>
          You don&apos;t have any companies yet.{" "}
          <a href="/sentinel/new-project" style={{ color: T.accent }}>
            Create one via New Project
          </a>
          .
        </p>
      ) : (
        <>
          <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.1rem", margin: "0 0 0.8rem 0" }}>
            Active reviews
          </h3>
          {activeCycles.length === 0 ? (
            <p style={{ fontSize: "0.85rem", color: T.inkSoft, marginBottom: "1.8rem" }}>
              No active review cycles right now.{" "}
              <a href="/sentinel/reviews" style={{ color: T.accent }}>
                Start one
              </a>
              .
            </p>
          ) : (
            <div style={{ marginBottom: "1.8rem" }}>
              {activeCycles.map((cycle) => (
                <a
                  key={cycle.id}
                  href={`/sentinel/reviews/${cycle.id}`}
                  style={{ ...cardStyle, display: "block", textDecoration: "none", color: T.ink }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
                    <div>
                      <p style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1rem", margin: "0 0 0.2rem 0" }}>
                        {cycle.label}
                      </p>
                      <p style={{ fontSize: "0.78rem", color: T.inkSoft, margin: 0 }}>
                        {`${cycle.company_name} \u00b7 ${periodTypeLabel(cycle.period_type)}`}
                      </p>
                    </div>
                    <span
                      style={{
                        fontSize: "0.68rem",
                        fontWeight: 600,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        padding: "0.28rem 0.7rem",
                        border: `1px solid ${T.accent}`,
                        color: T.accent,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {lifecycleLabel(cycle.status)}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          )}

          <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.1rem", margin: "0 0 0.8rem 0" }}>
            Companies
          </h3>
          {workspaces.map((w) => {
            const pending = pendingCountByWorkspace[w.id] ?? 0;
            return (
              <div key={w.id} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1rem", margin: 0 }}>
                  {w.company_name}
                </p>
                {pending > 0 ? (
                  <span style={{ fontSize: "0.8rem", color: T.accent }}>
                    {`${pending} pending investigation${pending === 1 ? "" : "s"}`}
                  </span>
                ) : (
                  <span style={{ fontSize: "0.8rem", color: T.inkSoft }}>Nothing pending</span>
                )}
              </div>
            );
          })}
        </>
      )}

      <p style={{ fontSize: "0.75rem", color: T.inkSoft, marginTop: "2rem", lineHeight: 1.6 }}>
        {"Business health summaries, document history, and upcoming deadlines aren't tracked yet \u2014 those depend on pieces of the roadmap (Health Engine, Document Intelligence storage, Decision Tracker) that haven't been built."}
      </p>
    </div>
  );
}
