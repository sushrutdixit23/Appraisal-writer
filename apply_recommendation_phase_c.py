# -*- coding: utf-8 -*-
"""
Sentinel - Recommendation Engine Phase C: display + approval UI on
Investigation Queue. Adds a "Recommendations" section per investigation
(both the pending-review view and the approved/edited view, mirroring
where InvestigationExtras already renders in each), with per-
recommendation Approve/Reject/Mark Implemented actions.
Touches:
  app/sentinel/lib/types.ts   (add Recommendation type)
  app/sentinel/page.tsx       (fetch, render, and act on recommendations)
Run from the repo root (the folder containing package.json).
"""
import io
import os
import sys

ROOT = os.getcwd()

def read(path):
    with io.open(path, "r", encoding="utf-8") as f:
        return f.read()

def write(path, content):
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)

def brace_check(path, content):
    opens = content.count("{")
    closes = content.count("}")
    if opens == closes:
        print("[OK] brace check " + path + ": " + str(opens) + " open / " + str(closes) + " close")
    else:
        print("[MISS] brace mismatch in " + path + ": " + str(opens) + " open / " + str(closes) + " close")

def apply_edit(content, old, new, label, get_content_path):
    count = content.count(old)
    if count == 0:
        print("[MISS] " + label + ": anchor not found. Run: Get-Content \"" + get_content_path + "\" and paste it back.")
        return None
    if count > 1:
        print("[MISS] " + label + ": anchor found " + str(count) + " times, expected 1. Run: Get-Content \"" + get_content_path + "\" and paste it back.")
        return None
    print("[OK] " + label)
    return content.replace(old, new, 1)

if not os.path.exists(os.path.join(ROOT, "package.json")):
    print("[MISS] not running from repo root - cd to the folder with package.json and rerun")
    sys.exit(1)
print("[OK] running from repo root")

# ---------------------------------------------------------------------
# 1. types.ts - add the Recommendation type
# ---------------------------------------------------------------------
types_path = os.path.join(ROOT, "app", "sentinel", "lib", "types.ts")
types_current = read(types_path)
types_get_content = types_path

types_old = """export type ReviewCycle = {
  id: string;
  workspace_id: string;
  label: string;
  period_type: ReviewCyclePeriodType;
  status: ReviewCycleStatus;
  opened_at: string;
  closed_at: string | null;
  created_by: string;
  created_at: string;
};"""
types_new = """export type ReviewCycle = {
  id: string;
  workspace_id: string;
  label: string;
  period_type: ReviewCyclePeriodType;
  status: ReviewCycleStatus;
  opened_at: string;
  closed_at: string | null;
  created_by: string;
  created_at: string;
};

export type RecommendationPriority = "High" | "Medium" | "Low";
export type RecommendationDifficulty = "Easy" | "Medium" | "Hard";
export type RecommendationStatus = "pending" | "approved" | "rejected" | "implemented";

// Recommendation Engine (Phase A/B) - structured recommendations,
// separated from investigations per the roadmap. confidence_score is
// always inherited from the parent investigation's own computed score
// at generation time, never asked of Claude directly - same rule as
// everywhere else in Sentinel.
export type Recommendation = {
  id: string;
  workspace_id: string;
  investigation_id: string | null;
  review_cycle_id: string | null;
  owner_id: string;
  title: string;
  priority: RecommendationPriority;
  business_value: string;
  financial_impact: string | null;
  owner: string;
  timeline: string;
  difficulty: RecommendationDifficulty;
  confidence_score: number | null;
  evidence: string | null;
  status: RecommendationStatus;
  created_at: string;
  updated_at: string;
};"""
types_result = apply_edit(types_current, types_old, types_new, "types.ts: add Recommendation type", types_get_content)
if types_result is not None:
    write(types_path, types_result)
    print("[OK] wrote " + types_path)
    brace_check(types_path, types_result)
else:
    print("[MISS] types.ts NOT written - anchor failed above. No partial write performed.")

# ---------------------------------------------------------------------
# 2. page.tsx edits
# ---------------------------------------------------------------------
page_path = os.path.join(ROOT, "app", "sentinel", "page.tsx")
current = read(page_path)
get_content_cmd = page_path

edit1_old = """import type { AnomalyFlag, FinancialStatement, Investigation, Workspace } from "./lib/types";"""
edit1_new = """import type { AnomalyFlag, FinancialStatement, Investigation, Recommendation, Workspace } from "./lib/types";"""
current2 = apply_edit(current, edit1_old, edit1_new, "add Recommendation import", get_content_cmd)

edit2_old = """const btnPrimary: React.CSSProperties = { ...btnBase, background: T.ink, color: T.background };

export default function InvestigationQueuePage() {"""
edit2_new = """const btnPrimary: React.CSSProperties = { ...btnBase, background: T.ink, color: T.background };

const PRIORITY_COLOR: Record<string, string> = {
  High: "#8C2A2A",
  Medium: "#8A6416",
  Low: T.inkSoft,
};

function RecommendationCard({
  rec,
  onDecide,
}: {
  rec: Recommendation;
  onDecide: (rec: Recommendation, decision: "approve" | "reject" | "implement") => void;
}) {
  return (
    <div
      style={{
        background: T.background,
        border: `1px solid ${T.rule}`,
        borderLeft: `2px solid ${PRIORITY_COLOR[rec.priority] ?? T.inkSoft}`,
        padding: "0.9rem 1.1rem",
        marginBottom: "0.7rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.4rem" }}>
        <p style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "0.98rem", color: T.ink, margin: 0 }}>
          {rec.title}
        </p>
        <span
          style={{
            fontSize: "0.64rem",
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: PRIORITY_COLOR[rec.priority] ?? T.inkSoft,
          }}
        >
          {rec.priority} priority
        </span>
      </div>
      <p style={{ fontSize: "0.85rem", lineHeight: 1.6, color: T.ink, margin: "0 0 0.5rem 0" }}>
        {rec.business_value}
      </p>
      {rec.financial_impact && (
        <p style={{ fontSize: "0.82rem", color: T.inkSoft, margin: "0 0 0.5rem 0" }}>
          Impact: {rec.financial_impact}
        </p>
      )}
      <p style={{ fontSize: "0.75rem", color: T.inkSoft, margin: "0 0 0.6rem 0" }}>
        {rec.owner} - {rec.timeline} - {rec.difficulty}
        {rec.confidence_score != null ? ` - Confidence: ${rec.confidence_score}%` : ""}
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span
          style={{
            fontSize: "0.66rem",
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: T.inkSoft,
          }}
        >
          {rec.status}
        </span>
        {rec.status === "pending" && (
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              style={{ ...btnBase, padding: "0.35rem 0.8rem", fontSize: "0.78rem" }}
              onClick={() => onDecide(rec, "approve")}
            >
              Approve
            </button>
            <button
              style={{ ...btnBase, padding: "0.35rem 0.8rem", fontSize: "0.78rem" }}
              onClick={() => onDecide(rec, "reject")}
            >
              Reject
            </button>
          </div>
        )}
        {rec.status === "approved" && (
          <button
            style={{ ...btnBase, padding: "0.35rem 0.8rem", fontSize: "0.78rem" }}
            onClick={() => onDecide(rec, "implement")}
          >
            Mark Implemented
          </button>
        )}
      </div>
    </div>
  );
}

export default function InvestigationQueuePage() {"""
current3 = None
if current2 is not None:
    current3 = apply_edit(current2, edit2_old, edit2_new, "add PRIORITY_COLOR + RecommendationCard", get_content_cmd)

edit3_old = """  const [edits, setEdits] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});"""
edit3_new = """  const [edits, setEdits] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [recommendations, setRecommendations] = useState<Map<string, Recommendation[]>>(new Map());"""
current4 = None
if current3 is not None:
    current4 = apply_edit(current3, edit3_old, edit3_new, "add recommendations state", get_content_cmd)

edit4_old = """    const [wsRes, invRes] = await Promise.all([
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
      const m = new Map<string, Investigation>();
      for (const inv of (invRes.data ?? []) as Investigation[]) {
        m.set(`${inv.workspace_id}|${inv.period_label}`, inv);
      }
      setInvestigations(m);
    }
    setLoading(false);
  }, [router]);"""
edit4_new = """    const [wsRes, invRes, recRes] = await Promise.all([
      supabase.from("sentinel_workspaces").select("*"),
      supabase.from("sentinel_investigations").select("*"),
      supabase.from("sentinel_recommendations").select("*"),
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
      const m = new Map<string, Investigation>();
      for (const inv of (invRes.data ?? []) as Investigation[]) {
        m.set(`${inv.workspace_id}|${inv.period_label}`, inv);
      }
      setInvestigations(m);
    }
    if (!recRes.error) {
      const rm = new Map<string, Recommendation[]>();
      for (const rec of (recRes.data ?? []) as Recommendation[]) {
        if (!rec.investigation_id) continue;
        if (!rm.has(rec.investigation_id)) rm.set(rec.investigation_id, []);
        rm.get(rec.investigation_id)!.push(rec);
      }
      setRecommendations(rm);
    }
    setLoading(false);
  }, [router]);"""
current5 = None
if current4 is not None:
    current5 = apply_edit(current4, edit4_old, edit4_new, "fetch + map recommendations in loadAll", get_content_cmd)

edit5_old = """  async function reopen(inv: Investigation) {
    const { error: updateError } = await supabase
      .from("sentinel_investigations")
      .update({ status: "pending", final_narrative: null, archived_at: null, updated_at: new Date().toISOString() })
      .eq("id", inv.id);
    if (updateError) {
      alert(updateError.message);
      return;
    }
    await loadAll();
  }

  const stats: [string, number][] = ["""
edit5_new = """  async function reopen(inv: Investigation) {
    const { error: updateError } = await supabase
      .from("sentinel_investigations")
      .update({ status: "pending", final_narrative: null, archived_at: null, updated_at: new Date().toISOString() })
      .eq("id", inv.id);
    if (updateError) {
      alert(updateError.message);
      return;
    }
    await loadAll();
  }

  async function decideRecommendation(rec: Recommendation, decision: "approve" | "reject" | "implement") {
    const status = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "implemented";
    const { error: updateError } = await supabase
      .from("sentinel_recommendations")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", rec.id);
    if (updateError) {
      alert(updateError.message);
      return;
    }
    await loadAll();
  }

  const stats: [string, number][] = ["""
current6 = None
if current5 is not None:
    current6 = apply_edit(current5, edit5_old, edit5_new, "add decideRecommendation function", get_content_cmd)

edit6_old = """                <InvestigationExtras inv={inv} />

                {inv.suggested_questions.length > 0 && ("""
edit6_new = """                <InvestigationExtras inv={inv} />

                {(recommendations.get(inv.id) ?? []).length > 0 && (
                  <>
                    <Eyebrow>Recommendations</Eyebrow>
                    {(recommendations.get(inv.id) ?? []).map((rec) => (
                      <RecommendationCard key={rec.id} rec={rec} onDecide={decideRecommendation} />
                    ))}
                  </>
                )}

                {inv.suggested_questions.length > 0 && ("""
current7 = None
if current6 is not None:
    current7 = apply_edit(current6, edit6_old, edit6_new, "render Recommendations in pending view", get_content_cmd)

edit7_old = """                    <InvestigationExtras inv={inv} />
                    {inv.reviewer_notes && ("""
edit7_new = """                    <InvestigationExtras inv={inv} />
                    {(recommendations.get(inv.id) ?? []).length > 0 && (
                      <>
                        <Eyebrow>Recommendations</Eyebrow>
                        {(recommendations.get(inv.id) ?? []).map((rec) => (
                          <RecommendationCard key={rec.id} rec={rec} onDecide={decideRecommendation} />
                        ))}
                      </>
                    )}
                    {inv.reviewer_notes && ("""
current8 = None
if current7 is not None:
    current8 = apply_edit(current7, edit7_old, edit7_new, "render Recommendations in approved/edited view", get_content_cmd)

if current8 is not None:
    write(page_path, current8)
    print("[OK] wrote " + page_path)
    brace_check(page_path, current8)
else:
    print("[MISS] page.tsx NOT written - at least one edit failed above. No partial write performed.")

print("")
print("Then:  npm run build")
print("Then:  git status  /  git diff --stat")
