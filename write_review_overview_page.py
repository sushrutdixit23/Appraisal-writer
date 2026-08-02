import pathlib

path = pathlib.Path("app/sentinel/reviews/[id]/page.tsx")
path.parent.mkdir(parents=True, exist_ok=True)

content = r'''"use client";
export const dynamic = "force-dynamic";

// Sentinel — Review Overview. Opens one specific review cycle and shows
// what's actually attached to it: the cycle's own status, any financial
// statement(s) with review_cycle_id pointing here (wired in Add Period),
// and any investigations with review_cycle_id pointing here.
//
// Honest scope note: investigation generation (wherever that flow lives
// - likely /api/sentinel/narrative, not yet seen) doesn't set
// review_cycle_id on the investigations it creates yet, so the
// Investigations section below will show empty for every review cycle
// today, even ones with real approved findings elsewhere in the app.
// That's not a bug in this page - it's the next wiring gap, same shape
// as the Add Period gap that was just closed. Flagged in the empty
// state itself rather than silently showing "0" with no explanation.
//
// "Next recommended action" is a small set of rule-based hints derived
// from what's actually attached (no statement yet? no investigations
// yet? still in Draft?) - not the full Review Checklist from the
// roadmap (Phase 3), which needs task-level tracking this doesn't have.

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { LIFECYCLE, lifecycleLabel, nextStatus, periodTypeLabel } from "../../lib/reviewCycle";
import { SERIF, T } from "../../lib/theme";
import type { FinancialStatement, Investigation, ReviewCycle, Workspace } from "../../lib/types";

const linkBtn: React.CSSProperties = {
  fontSize: "0.78rem",
  background: "none",
  border: "none",
  textDecoration: "underline",
  cursor: "pointer",
  padding: 0,
  fontFamily: "inherit",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString();
}

function fmtCr(n: number | null): string {
  if (n == null) return "\u2014";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 1 });
}

export default function ReviewOverviewPage() {
  const router = useRouter();
  const params = useParams();
  const cycleId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const [cycle, setCycle] = useState<ReviewCycle | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [statements, setStatements] = useState<FinancialStatement[]>([]);
  const [investigations, setInvestigations] = useState<Investigation[]>([]);

  useEffect(() => {
    if (!cycleId) return;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push("/login");
        return;
      }
      const { data: cycleData, error: cycleError } = await supabase
        .from("sentinel_review_cycles")
        .select("*")
        .eq("id", cycleId)
        .single();
      if (cycleError || !cycleData) {
        setError(cycleError?.message ?? "This review cycle could not be found.");
        setLoading(false);
        return;
      }
      const c = cycleData as ReviewCycle;
      setCycle(c);

      const [{ data: wsData }, { data: stmtData }, { data: invData }] = await Promise.all([
        supabase.from("sentinel_workspaces").select("*").eq("id", c.workspace_id).single(),
        supabase
          .from("sentinel_statements")
          .select("*")
          .eq("review_cycle_id", cycleId)
          .order("period_end_date", { ascending: false }),
        supabase
          .from("sentinel_investigations")
          .select("*")
          .eq("review_cycle_id", cycleId)
          .order("created_at", { ascending: false }),
      ]);
      setWorkspace((wsData ?? null) as Workspace | null);
      setStatements((stmtData ?? []) as FinancialStatement[]);
      setInvestigations((invData ?? []) as Investigation[]);
      setLoading(false);
    })();
  }, [cycleId, router]);

  async function advance() {
    if (!cycle) return;
    const next = nextStatus(cycle.status);
    if (!next) return;
    setAdvancing(true);
    const patch: Record<string, unknown> = { status: next };
    if ((next === "approved" || next === "closed") && !cycle.closed_at) {
      patch.closed_at = new Date().toISOString();
    }
    const { data, error: updateError } = await supabase
      .from("sentinel_review_cycles")
      .update(patch)
      .eq("id", cycle.id)
      .select()
      .single();
    setAdvancing(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setCycle(data as ReviewCycle);
  }

  if (loading) return <p style={{ color: T.inkSoft }}>Loading Sentinel…</p>;

  if (error || !cycle) {
    return (
      <div>
        <p style={{ color: T.ink }}>{error ?? "This review cycle could not be found."}</p>
        <a href="/sentinel/reviews" style={{ color: T.accent, fontSize: "0.85rem" }}>
          \u2190 Back to Review Cycles
        </a>
      </div>
    );
  }

  const next = nextStatus(cycle.status);
  const currentIdx = LIFECYCLE.findIndex((s) => s.value === cycle.status);

  // Small, honest, rule-based hints - not the full Review Checklist
  // (Phase 3). Each hint reflects something this page can actually see.
  const hints: string[] = [];
  if (statements.length === 0) {
    hints.push("No financial statement is attached yet — add or edit a period in Manage Periods and pick this review from the \"Review cycle\" dropdown.");
  }
  if (statements.length > 0 && cycle.status === "draft") {
    hints.push("A statement is attached — move this review to \"Importing Data\" or beyond once you're ready to start analysis.");
  }
  if (investigations.length === 0) {
    hints.push("No investigations are attached to this review yet. Investigation generation doesn't tag review_cycle_id yet, so even approved findings elsewhere won't show here until that's wired.");
  }
  if (cycle.status === "approved") {
    hints.push("This review is Approved — move it to \"Closed\" once everything is finalized.");
  }

  return (
    <div>
      <a href="/sentinel/reviews" style={{ color: T.inkSoft, fontSize: "0.78rem" }}>
        \u2190 All reviews
      </a>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: "0.6rem" }}>
        <div>
          <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0 }}>
            {cycle.label}
          </h1>
          <p style={{ fontSize: "0.85rem", color: T.inkSoft, margin: "0.4rem 0 0 0" }}>
            {workspace?.company_name ?? "Unknown company"} · {periodTypeLabel(cycle.period_type)} · opened{" "}
            {fmtDate(cycle.opened_at)}
            {cycle.closed_at ? ` · closed ${fmtDate(cycle.closed_at)}` : ""}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
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
            <div style={{ marginTop: "0.5rem" }}>
              <button style={{ ...linkBtn, color: T.ink }} onClick={advance} disabled={advancing}>
                {advancing ? "Moving…" : `Move to ${lifecycleLabel(next)} \u2192`}
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p
          style={{
            fontSize: "0.85rem",
            color: T.ink,
            background: T.accentSoft,
            borderLeft: `2px solid ${T.accent}`,
            padding: "0.6rem 0.9rem",
            margin: "1.2rem 0",
          }}
        >
          {error}
        </p>
      )}

      {/* Lifecycle progress strip */}
      <div style={{ display: "flex", gap: 2, margin: "1.4rem 0 1.8rem 0" }}>
        {LIFECYCLE.map((stage, i) => (
          <div
            key={stage.value}
            title={stage.label}
            style={{
              flex: 1,
              height: 4,
              background: i <= currentIdx ? T.accent : T.rule,
            }}
          />
        ))}
      </div>

      {/* Next recommended action */}
      {hints.length > 0 && (
        <div
          style={{
            background: T.card,
            border: `1px solid ${T.rule}`,
            borderRadius: 3,
            padding: "1.2rem 1.5rem",
            marginBottom: "1.6rem",
          }}
        >
          <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1rem", margin: "0 0 0.7rem 0" }}>
            Next up
          </h3>
          {hints.map((h, i) => (
            <p key={i} style={{ fontSize: "0.85rem", color: T.inkSoft, lineHeight: 1.6, margin: "0.3rem 0" }}>
              {h}
            </p>
          ))}
        </div>
      )}

      {/* Financial statement(s) attached */}
      <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.1rem", margin: "0 0 0.8rem 0" }}>
        Financial data
      </h3>
      {statements.length === 0 ? (
        <p style={{ fontSize: "0.85rem", color: T.inkSoft, marginBottom: "1.6rem" }}>
          No statement attached to this review yet.
        </p>
      ) : (
        statements.map((s) => (
          <div
            key={s.id}
            style={{
              background: T.card,
              border: `1px solid ${T.rule}`,
              borderRadius: 3,
              padding: "1.1rem 1.4rem",
              marginBottom: "0.8rem",
            }}
          >
            <p style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1rem", margin: "0 0 0.5rem 0" }}>
              {s.period_label} ({s.period_type}) \u00b7 {s.basis}
            </p>
            <div style={{ display: "flex", gap: "2rem", fontSize: "0.85rem" }}>
              <span>
                <span style={{ color: T.inkSoft }}>Revenue </span>
                <strong>\u20b9{fmtCr(s.revenue_from_operations)} cr</strong>
              </span>
              <span>
                <span style={{ color: T.inkSoft }}>PBT </span>
                <strong>\u20b9{fmtCr(s.profit_before_tax)} cr</strong>
              </span>
              <span>
                <span style={{ color: T.inkSoft }}>PAT </span>
                <strong>\u20b9{fmtCr(s.profit_after_tax)} cr</strong>
              </span>
            </div>
          </div>
        ))
      )}

      {/* Investigations attached */}
      <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.1rem", margin: "1.6rem 0 0.8rem 0" }}>
        Investigations
      </h3>
      {investigations.length === 0 ? (
        <p style={{ fontSize: "0.85rem", color: T.inkSoft }}>
          No investigations attached to this review yet.
        </p>
      ) : (
        investigations.map((inv) => (
          <div
            key={inv.id}
            style={{
              background: T.card,
              border: `1px solid ${T.rule}`,
              borderRadius: 3,
              padding: "1.1rem 1.4rem",
              marginBottom: "0.8rem",
            }}
          >
            <p style={{ fontSize: "0.9rem", margin: 0 }}>
              {inv.period_label} \u2014 <span style={{ color: T.inkSoft }}>{inv.status}</span>
              {inv.confidence_score != null && (
                <span style={{ color: T.inkSoft }}> \u00b7 confidence {inv.confidence_score}%</span>
              )}
            </p>
          </div>
        ))
      )}
    </div>
  );
}
'''

path.write_text(content, encoding="utf-8")
print(f"OK - wrote {len(content.encode('utf-8'))} bytes to {path}")