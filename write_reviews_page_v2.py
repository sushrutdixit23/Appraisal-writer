import pathlib

path = pathlib.Path("app/sentinel/reviews/page.tsx")
path.parent.mkdir(parents=True, exist_ok=True)

content = r'''"use client";
export const dynamic = "force-dynamic";

// Sentinel — Review Cycles. Phase 1's core object: every recurring
// review ("July 2026 Review", "FY25 Annual Review") lives here, and
// Financial Statements/Investigations/Decisions will attach to one via
// review_cycle_id going forward. This page is intentionally scoped to
// just the object itself - create a cycle, see its list, move it
// through the lifecycle - not yet wired into Financial Statements, KPI
// Dashboard, or Investigation Queue (none of those filter by
// review_cycle_id yet). That wiring is the next increment, not this one;
// building it all at once was the exact kind of scope creep the roadmap
// review flagged.
//
// Direct client reads/writes against sentinel_review_cycles, same
// pattern as New Project/Add Period - RLS policies (owner manages /
// read for accessible workspaces) mirror sentinel_statements' policies
// exactly, added alongside this page.
//
// Lifecycle values and order come directly from the live DB CHECK
// constraint (sentinel_review_cycles_status_check), confirmed by query
// rather than assumed: Draft -> Importing Data -> Analyzing -> In
// Review -> Approved -> Closed. Forward-only in this UI, matching the
// roadmap's diagram (no backward arrows shown). Reaching Approved or
// Closed stamps closed_at.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { SERIF, T } from "../lib/theme";
import type { ReviewCycle, ReviewCyclePeriodType, ReviewCycleStatus, Workspace } from "../lib/types";

const inputStyle: React.CSSProperties = {
  width: "100%",
  fontFamily: "inherit",
  fontSize: "0.9rem",
  padding: "0.55rem 0.7rem",
  border: `1px solid ${T.rule}`,
  borderRadius: 3,
  background: T.card,
  color: T.ink,
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.7rem",
  fontWeight: 500,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: T.inkSoft,
  marginBottom: "0.3rem",
};

function Field({
  label,
  children,
  span2,
}: {
  label: string;
  children: React.ReactNode;
  span2?: boolean;
}) {
  return (
    <div style={{ gridColumn: span2 ? "span 2" : undefined }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  fontFamily: "inherit",
  fontSize: "0.88rem",
  fontWeight: 500,
  padding: "0.6rem 1.4rem",
  border: `1px solid ${T.ink}`,
  borderRadius: 3,
  background: T.ink,
  color: T.background,
  cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  ...btnPrimary,
  background: "transparent",
  color: T.ink,
};
const linkBtn: React.CSSProperties = {
  fontSize: "0.78rem",
  background: "none",
  border: "none",
  textDecoration: "underline",
  cursor: "pointer",
  padding: 0,
  fontFamily: "inherit",
};

const PERIOD_TYPES: { value: ReviewCyclePeriodType; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
];

// Single source of truth for valid forward transitions and display
// labels. Values match the DB CHECK constraint exactly - a value not in
// this list would be rejected by Postgres regardless of what this array
// says, so this list must stay in sync with
// sentinel_review_cycles_status_check if that constraint ever changes.
const LIFECYCLE: { value: ReviewCycleStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "importing", label: "Importing Data" },
  { value: "analyzing", label: "Analyzing" },
  { value: "in_review", label: "In Review" },
  { value: "approved", label: "Approved" },
  { value: "closed", label: "Closed" },
];

function lifecycleLabel(status: ReviewCycleStatus): string {
  return LIFECYCLE.find((s) => s.value === status)?.label ?? status;
}

function nextStatus(status: ReviewCycleStatus): ReviewCycleStatus | null {
  const idx = LIFECYCLE.findIndex((s) => s.value === status);
  if (idx === -1 || idx === LIFECYCLE.length - 1) return null;
  return LIFECYCLE[idx + 1].value;
}

export default function ReviewCyclesPage() {
  const router = useRouter();
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string>("");

  const [cycles, setCycles] = useState<ReviewCycle[]>([]);
  const [loadingCycles, setLoadingCycles] = useState(false);

  const [newLabel, setNewLabel] = useState("");
  const [newPeriodType, setNewPeriodType] = useState<ReviewCyclePeriodType>("monthly");
  const [creating, setCreating] = useState(false);

  const [advancingId, setAdvancingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push("/login");
        return;
      }
      const { data, error: wsError } = await supabase
        .from("sentinel_workspaces")
        .select("*")
        .eq("owner_id", sessionData.session.user.id);
      if (wsError) {
        setError(wsError.message);
      } else {
        const ws = (data ?? []) as Workspace[];
        setWorkspaces(ws);
        if (ws.length > 0) setWorkspaceId(ws[0].id);
      }
      setLoadingWorkspaces(false);
    })();
  }, [router]);

  useEffect(() => {
    if (!workspaceId) {
      setCycles([]);
      return;
    }
    (async () => {
      setLoadingCycles(true);
      const { data, error: cyclesError } = await supabase
        .from("sentinel_review_cycles")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("opened_at", { ascending: false });
      if (cyclesError) {
        setError(cyclesError.message);
      } else {
        setCycles((data ?? []) as ReviewCycle[]);
      }
      setLoadingCycles(false);
    })();
  }, [workspaceId]);

  async function createCycle() {
    setError(null);
    if (!workspaceId) {
      setError("Select a company first.");
      return;
    }
    if (!newLabel.trim()) {
      setError("Give this review a label, e.g. \"July 2026 Review\" or \"FY26 Annual Review\".");
      return;
    }
    setCreating(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setCreating(false);
      router.push("/login");
      return;
    }
    const { data, error: insertError } = await supabase
      .from("sentinel_review_cycles")
      .insert({
        workspace_id: workspaceId,
        label: newLabel.trim(),
        period_type: newPeriodType,
        status: "draft" as ReviewCycleStatus,
        created_by: userData.user.id,
      })
      .select()
      .single();
    setCreating(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setCycles((prev) => [data as ReviewCycle, ...prev]);
    setNewLabel("");
    setNewPeriodType("monthly");
  }

  async function advanceCycle(cycle: ReviewCycle) {
    const next = nextStatus(cycle.status);
    if (!next) return;
    setError(null);
    setAdvancingId(cycle.id);
    const patch: Record<string, unknown> = { status: next };
    // Reaching Approved stamps closed_at; if a cycle somehow jumps
    // straight to Closed without ever passing through Approved
    // (shouldn't happen via this UI, but don't leave closed_at unset
    // if it does), stamp it there too.
    if ((next === "approved" || next === "closed") && !cycle.closed_at) {
      patch.closed_at = new Date().toISOString();
    }
    const { data, error: updateError } = await supabase
      .from("sentinel_review_cycles")
      .update(patch)
      .eq("id", cycle.id)
      .select()
      .single();
    setAdvancingId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setCycles((prev) => prev.map((c) => (c.id === cycle.id ? (data as ReviewCycle) : c)));
  }

  if (loadingWorkspaces) return <p style={{ color: T.inkSoft }}>Loading Sentinel…</p>;

  if (workspaces.length === 0) {
    return (
      <div>
        <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0 }}>
          Review Cycles
        </h1>
        <p style={{ fontSize: "0.9rem", color: T.inkSoft, marginTop: "0.8rem" }}>
          You don&apos;t have any companies yet.{" "}
          <a href="/sentinel/new-project" style={{ color: T.accent }}>
            Create one via New Project
          </a>{" "}
          first.
        </p>
      </div>
    );
  }

  const selectedWs = workspaces.find((w) => w.id === workspaceId);

  return (
    <div>
      <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0 }}>
        Review Cycles
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
        Every recurring review lives here — start one, then move it through the lifecycle
      </p>

      {error && (
        <p
          style={{
            fontSize: "0.85rem",
            color: T.ink,
            background: T.accentSoft,
            borderLeft: `2px solid ${T.accent}`,
            padding: "0.6rem 0.9rem",
            marginBottom: "1.2rem",
          }}
        >
          {error}
        </p>
      )}

      <div style={{ marginBottom: "1.6rem", maxWidth: 640 }}>
        <Field label="Company">
          <select style={inputStyle} value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.company_name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div
        style={{
          background: T.card,
          border: `1px solid ${T.rule}`,
          borderRadius: 3,
          padding: "1.6rem 1.8rem",
          maxWidth: 640,
          marginBottom: "1.6rem",
        }}
      >
        <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.1rem", margin: "0 0 1rem 0" }}>
          Start a new review
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.2rem" }}>
          <Field label="Label" span2>
            <input
              style={inputStyle}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder={`e.g. "July 2026 Review" or "${selectedWs?.company_name ?? "Company"} FY26 Annual Review"`}
            />
          </Field>
          <Field label="Cadence">
            <select
              style={inputStyle}
              value={newPeriodType}
              onChange={(e) => setNewPeriodType(e.target.value as ReviewCyclePeriodType)}
            >
              {PERIOD_TYPES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <button style={btnPrimary} onClick={createCycle} disabled={creating}>
          {creating ? "Creating…" : "Start review"}
        </button>
      </div>

      <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.1rem", margin: "0 0 1rem 0" }}>
        {selectedWs?.company_name ?? "This company"}&apos;s reviews
      </h3>

      {loadingCycles ? (
        <p style={{ color: T.inkSoft, fontSize: "0.9rem" }}>Loading…</p>
      ) : cycles.length === 0 ? (
        <p style={{ color: T.inkSoft, fontSize: "0.9rem" }}>
          No reviews started yet for {selectedWs?.company_name ?? "this company"}.
        </p>
      ) : (
        cycles.map((cycle) => {
          const next = nextStatus(cycle.status);
          return (
            <div
              key={cycle.id}
              style={{
                background: T.card,
                border: `1px solid ${T.rule}`,
                borderRadius: 3,
                padding: "1.2rem 1.5rem",
                marginBottom: "0.9rem",
                maxWidth: 640,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "1rem",
                flexWrap: "wrap",
              }}
            >
              <div>
                <p style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.05rem", margin: "0 0 0.3rem 0" }}>
                  {cycle.label}
                </p>
                <p style={{ fontSize: "0.78rem", color: T.inkSoft, margin: 0 }}>
                  {PERIOD_TYPES.find((p) => p.value === cycle.period_type)?.label ?? cycle.period_type} · opened{" "}
                  {new Date(cycle.opened_at).toLocaleDateString()}
                  {cycle.closed_at ? ` · closed ${new Date(cycle.closed_at).toLocaleDateString()}` : ""}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
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
                    whiteSpace: "nowrap",
                  }}
                >
                  <span style={{ width: 5, height: 5, background: T.accent }} />
                  {lifecycleLabel(cycle.status)}
                </span>
                {next && (
                  <button
                    style={{ ...linkBtn, color: T.ink }}
                    onClick={() => advanceCycle(cycle)}
                    disabled={advancingId === cycle.id}
                  >
                    {advancingId === cycle.id ? "Moving…" : `Move to ${lifecycleLabel(next)} →`}
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
'''

path.write_text(content, encoding="utf-8")
print(f"OK — wrote {len(content.encode('utf-8'))} bytes to {path}")