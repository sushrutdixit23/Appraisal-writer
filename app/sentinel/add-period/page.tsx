"use client";
export const dynamic = "force-dynamic";

// Sentinel — Manage Periods (route stays /sentinel/add-period). Add, edit and delete a company's periods,
// rename or delete the company itself, optionally pre-filling a period from an uploaded filing. Only
// companies you own appear here: the reference companies are read-only by design.
//
// Every save runs the same checks the server route runs (validate.ts): text that is not a number is an
// error, an unbalanced balance sheet is refused, unusual-but-possible things are warnings. The period list
// is reloaded after every save and delete, so reopening a period you just edited shows what was saved,
// not what the page loaded with.
//
// Deleting a company removes its dependent rows child-first and stops at the first failure with a message
// naming the step - it does not carry on and leave the company half deleted.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { sortWorkspaces } from "../lib/access";
import { BASES, PERIOD_TYPES, statementToFormValues } from "../lib/fields";
import { ExtractUpload, type AppliedDraft } from "../lib/ExtractUpload";
import { Field, StatementFields, inputStyle } from "../lib/StatementFields";
import { SERIF, T } from "../lib/theme";
import { unitLabel } from "../lib/units";
import { useSelectedWorkspace } from "../lib/useSelectedWorkspace";
import { prepareFromForm, type Issue } from "../lib/validate";
import type { Basis, FinancialStatement, ReviewCycle, Workspace } from "../lib/types";

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
const btnGhost: React.CSSProperties = { ...btnPrimary, background: "transparent", color: T.ink };
const linkBtn: React.CSSProperties = {
  fontSize: "0.78rem",
  background: "none",
  border: "none",
  textDecoration: "underline",
  cursor: "pointer",
  padding: 0,
  fontFamily: "inherit",
};
const card: React.CSSProperties = {
  background: T.card,
  border: `1px solid ${T.rule}`,
  borderRadius: 3,
  padding: "1.6rem 1.8rem",
  maxWidth: 640,
};

export default function AddPeriodPage() {
  const router = useRouter();
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, chooseWorkspace] = useSelectedWorkspace(workspaces.map((w) => w.id));
  const [done, setDone] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);

  const [periodType, setPeriodType] = useState<string>("FY");
  const [periodLabel, setPeriodLabel] = useState("");
  const [periodEndDate, setPeriodEndDate] = useState("");
  const [basis, setBasis] = useState<Basis>("consolidated");
  const [values, setValues] = useState<Record<string, string>>({});
  const [sourceFile, setSourceFile] = useState("manual entry");
  const [extractionNotes, setExtractionNotes] = useState<string | null>(null);
  const [verify, setVerify] = useState<string[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [saveWarnings, setSaveWarnings] = useState<string[]>([]);

  // "new" means the form is building an insert; any other value is the id of the statement being edited.
  const [statements, setStatements] = useState<FinancialStatement[]>([]);
  const [selectedStatementId, setSelectedStatementId] = useState<string>("new");
  const [confirmDeleteStatement, setConfirmDeleteStatement] = useState(false);
  const [deletingStatement, setDeletingStatement] = useState(false);

  const [reviewCycles, setReviewCycles] = useState<ReviewCycle[]>([]);
  const [selectedReviewCycleId, setSelectedReviewCycleId] = useState<string>("");

  const [editingCompanyName, setEditingCompanyName] = useState(false);
  const [companyNameDraft, setCompanyNameDraft] = useState("");
  const [savingCompanyName, setSavingCompanyName] = useState(false);
  const [confirmDeleteWorkspace, setConfirmDeleteWorkspace] = useState(false);
  const [deleteWorkspaceConfirmText, setDeleteWorkspaceConfirmText] = useState("");
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);

  const selectedWs = workspaces.find((w) => w.id === workspaceId);

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push("/login");
        return;
      }
      const userId = sessionData.session.user.id;
      const { data, error: wsError } = await supabase.from("sentinel_workspaces").select("*").eq("owner_id", userId);
      if (wsError) setErrors([wsError.message]);
      else setWorkspaces(sortWorkspaces((data ?? []) as Workspace[], userId));
      setLoadingWorkspaces(false);
    })();
  }, [router]);

  const reloadStatements = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("sentinel_statements")
      .select("*")
      .eq("workspace_id", id)
      .order("period_end_date", { ascending: false });
    if (error) setErrors([error.message]);
    else setStatements((data ?? []) as FinancialStatement[]);
  }, []);

  // Load this company's periods and review cycles whenever the selected company changes.
  useEffect(() => {
    if (!workspaceId) {
      setStatements([]);
      setReviewCycles([]);
      return;
    }
    setSelectedStatementId("new");
    setDone(false);
    (async () => {
      await reloadStatements(workspaceId);
      const { data } = await supabase
        .from("sentinel_review_cycles")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("opened_at", { ascending: false });
      setReviewCycles((data ?? []) as ReviewCycle[]);
    })();
  }, [workspaceId, reloadStatements]);

  // Fill (or clear) the form whenever the chosen period changes.
  useEffect(() => {
    setErrors([]);
    setIssues([]);
    setSaveWarnings([]);
    setVerify([]);
    if (selectedStatementId === "new") {
      setPeriodType("FY");
      setPeriodLabel("");
      setPeriodEndDate("");
      setBasis(selectedWs?.comparison_basis ?? "consolidated");
      setValues({});
      setSourceFile("manual entry");
      setExtractionNotes(null);
      setSelectedReviewCycleId("");
      return;
    }
    const stmt = statements.find((s) => s.id === selectedStatementId);
    if (!stmt) return;
    setPeriodType(stmt.period_type);
    setPeriodLabel(stmt.period_label);
    setPeriodEndDate(stmt.period_end_date);
    setBasis(stmt.basis);
    setValues(statementToFormValues(stmt as unknown as Record<string, unknown>));
    setSourceFile(stmt.source_file);
    setExtractionNotes(stmt.extraction_notes);
    setSelectedReviewCycleId(stmt.review_cycle_id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStatementId, statements, selectedWs?.id]);

  function applyDraft({ result, values: extracted, unitNote }: AppliedDraft) {
    if (result.period_type) setPeriodType(result.period_type);
    if (result.period_label) setPeriodLabel(result.period_label);
    if (result.period_end_date) setPeriodEndDate(result.period_end_date);
    if (result.basis) setBasis(result.basis);
    setValues((prev) => ({ ...prev, ...extracted }));
    setExtractionNotes([result.extraction_notes, unitNote].filter(Boolean).join(" ") || null);
    setVerify(result.low_confidence_fields ?? []);
    setSourceFile(result.source_file ?? "uploaded filing");
    setIssues([]);
  }

  async function saveStatement() {
    setErrors([]);
    if (!workspaceId || !selectedWs) {
      setErrors(["Select a company first."]);
      return;
    }
    const editingId = selectedStatementId === "new" ? null : selectedStatementId;
    const others = statements.filter((s) => s.id !== editingId);
    const label = periodLabel.trim();

    // The database holds one statement per company, label and basis.
    if (others.some((s) => s.period_label === label && s.basis === basis)) {
      setErrors([
        `A ${basis} statement labelled "${label}" already exists for ${selectedWs.company_name}. ` +
          `Choose it in the Period list to edit it, or use a different label.`,
      ]);
      return;
    }

    const prepared = prepareFromForm(
      { periodType, periodLabel: label, periodEndDate, basis, values, sourceFile, extractionNotes },
      others
    );
    setIssues([...prepared.issues]);
    if (!prepared.row) {
      setErrors(prepared.errors);
      return;
    }

    const record = { ...prepared.row, workspace_id: workspaceId, review_cycle_id: selectedReviewCycleId || null };
    setSaving(true);
    if (editingId) {
      const { error } = await supabase.from("sentinel_statements").update(record).eq("id", editingId);
      if (error) {
        setSaving(false);
        setErrors([error.message]);
        return;
      }
      setJustUpdated(true);
    } else {
      const { error } = await supabase.from("sentinel_statements").insert(record);
      if (error) {
        setSaving(false);
        setErrors([error.message]);
        return;
      }
      setJustUpdated(false);
    }
    await reloadStatements(workspaceId);
    setSaving(false);
    setSaveWarnings(prepared.warnings);
    setDone(true);
  }

  async function deleteStatement() {
    if (selectedStatementId === "new") return;
    setDeletingStatement(true);
    const { error } = await supabase.from("sentinel_statements").delete().eq("id", selectedStatementId);
    setDeletingStatement(false);
    if (error) {
      setErrors([error.message]);
      return;
    }
    await reloadStatements(workspaceId);
    setSelectedStatementId("new");
    setConfirmDeleteStatement(false);
  }

  async function saveCompanyName() {
    if (!companyNameDraft.trim()) {
      setErrors(["Company name can't be empty."]);
      return;
    }
    setSavingCompanyName(true);
    const { error } = await supabase.from("sentinel_workspaces").update({ company_name: companyNameDraft.trim() }).eq("id", workspaceId);
    setSavingCompanyName(false);
    if (error) {
      setErrors([error.message]);
      return;
    }
    setWorkspaces((prev) => prev.map((w) => (w.id === workspaceId ? { ...w, company_name: companyNameDraft.trim() } : w)));
    setEditingCompanyName(false);
  }

  async function deleteWorkspace() {
    if (!selectedWs) return;
    if (deleteWorkspaceConfirmText.trim() !== selectedWs.company_name) {
      setErrors(["Type the company name exactly to confirm deletion."]);
      return;
    }
    setDeletingWorkspace(true);
    setErrors([]);
    // Children before parents, stopping at the first failure so a half-deleted company is never left
    // behind without the page saying which step stopped.
    const steps: [string, string][] = [
      ["recommendations", "sentinel_recommendations"],
      ["investigations", "sentinel_investigations"],
      ["periods", "sentinel_statements"],
      ["review cycles", "sentinel_review_cycles"],
    ];
    for (const [name, table] of steps) {
      const { error } = await supabase.from(table).delete().eq("workspace_id", selectedWs.id);
      if (error) {
        setDeletingWorkspace(false);
        setErrors([`Could not delete the company's ${name}: ${error.message}. Nothing after this step was deleted; try again, or contact support if it keeps failing.`]);
        await reloadStatements(selectedWs.id);
        return;
      }
    }
    const { error } = await supabase.from("sentinel_workspaces").delete().eq("id", selectedWs.id);
    setDeletingWorkspace(false);
    if (error) {
      setErrors([`The company's data was deleted but the company itself could not be: ${error.message}`]);
      return;
    }
    const remaining = workspaces.filter((w) => w.id !== selectedWs.id);
    setWorkspaces(remaining);
    if (remaining.length > 0) chooseWorkspace(remaining[0].id);
    setConfirmDeleteWorkspace(false);
    setDeleteWorkspaceConfirmText("");
  }

  if (loadingWorkspaces) return <p style={{ color: T.inkSoft }}>Loading Sentinel…</p>;

  if (workspaces.length === 0) {
    return (
      <div>
        <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0 }}>Manage Periods</h1>
        <p style={{ fontSize: "0.9rem", color: T.inkSoft, marginTop: "0.8rem" }}>
          You don&apos;t have any companies of your own yet. (The reference companies are read-only.){" "}
          <a href="/sentinel/new-project" style={{ color: T.accent }}>Create one via New Project</a> first.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0 }}>Manage Periods</h1>
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
        Add, edit, or delete a period for a company you created
      </p>

      {errors.length > 0 && (
        <div
          role="alert"
          style={{ fontSize: "0.85rem", color: T.ink, background: T.accentSoft, borderLeft: `2px solid ${T.accent}`, padding: "0.6rem 0.9rem", marginBottom: "1.2rem", maxWidth: 640 }}
        >
          {errors.map((e, i) => (
            <p key={i} style={{ margin: i === 0 ? 0 : "0.3rem 0 0 0" }}>{e}</p>
          ))}
        </div>
      )}

      {done ? (
        <div style={card}>
          <p style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.2rem", margin: "0 0 0.6rem 0" }}>
            {justUpdated ? "Period updated." : "Period added."}
          </p>
          <p style={{ fontSize: "0.9rem", color: T.inkSoft, lineHeight: 1.6, marginBottom: "1.2rem" }}>
            {selectedWs?.company_name} now reflects this change. Trend charts and YoY comparisons update automatically wherever this company appears.
          </p>
          {saveWarnings.length > 0 && (
            <div style={{ background: T.accentSoft, borderLeft: `2px solid ${T.accent}`, padding: "0.7rem 0.9rem", marginBottom: "1.2rem" }}>
              <p style={{ fontSize: "0.75rem", fontWeight: 600, color: T.ink, margin: "0 0 0.4rem 0" }}>Saved — but worth a second look:</p>
              {saveWarnings.map((w, i) => (
                <p key={i} style={{ fontSize: "0.8rem", color: T.ink, margin: "0.2rem 0", lineHeight: 1.5 }}>{w}</p>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button style={btnPrimary} onClick={() => router.push("/sentinel/kpi")}>View KPI Dashboard</button>
            <button
              style={btnGhost}
              onClick={() => {
                setDone(false);
                setSelectedStatementId("new");
              }}
            >
              Back to Manage Periods
            </button>
          </div>
        </div>
      ) : (
        <div style={card}>
          <div style={{ marginBottom: "1.2rem" }}>
            <Field label="Company" htmlFor="mp-company">
              <select id="mp-company" style={inputStyle} value={workspaceId} onChange={(e) => chooseWorkspace(e.target.value)}>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>{w.company_name}</option>
                ))}
              </select>
            </Field>
            {selectedWs && (
              <p style={{ fontSize: "0.75rem", color: T.inkSoft, margin: "0.4rem 0 0 0" }}>
                Figures for this company are entered in {unitLabel(selectedWs.currency_unit)}; compared on a {selectedWs.comparison_basis} basis.
              </p>
            )}

            {workspaceId && (
              <div style={{ marginTop: "0.6rem", display: "flex", gap: "0.9rem", alignItems: "center", flexWrap: "wrap" }}>
                {editingCompanyName ? (
                  <>
                    <input aria-label="Company name" style={{ ...inputStyle, width: 220 }} value={companyNameDraft} onChange={(e) => setCompanyNameDraft(e.target.value)} maxLength={120} />
                    <button style={{ ...linkBtn, color: T.ink }} onClick={saveCompanyName} disabled={savingCompanyName}>
                      {savingCompanyName ? "Saving…" : "Save name"}
                    </button>
                    <button style={{ ...linkBtn, color: T.inkSoft }} onClick={() => setEditingCompanyName(false)}>Cancel</button>
                  </>
                ) : (
                  <button
                    style={{ ...linkBtn, color: T.inkSoft }}
                    onClick={() => {
                      setCompanyNameDraft(selectedWs?.company_name ?? "");
                      setEditingCompanyName(true);
                    }}
                  >
                    Rename company
                  </button>
                )}
                {!confirmDeleteWorkspace && (
                  <button style={{ ...linkBtn, color: T.accent }} onClick={() => setConfirmDeleteWorkspace(true)}>Delete company…</button>
                )}
              </div>
            )}

            {confirmDeleteWorkspace && (
              <div style={{ marginTop: "0.8rem", padding: "0.9rem 1rem", border: `1px solid ${T.accent}`, background: T.accentSoft }}>
                <p style={{ fontSize: "0.82rem", margin: "0 0 0.6rem 0", lineHeight: 1.5 }}>
                  This permanently deletes <strong>{selectedWs?.company_name}</strong> and every period, review cycle, investigation and recommendation under it. Type the company name to confirm.
                </p>
                <input
                  aria-label="Type the company name to confirm"
                  style={{ ...inputStyle, marginBottom: "0.6rem" }}
                  value={deleteWorkspaceConfirmText}
                  onChange={(e) => setDeleteWorkspaceConfirmText(e.target.value)}
                  placeholder={selectedWs?.company_name}
                />
                <div style={{ display: "flex", gap: "0.6rem" }}>
                  <button style={btnPrimary} onClick={deleteWorkspace} disabled={deletingWorkspace}>
                    {deletingWorkspace ? "Deleting…" : "Permanently delete"}
                  </button>
                  <button
                    style={btnGhost}
                    onClick={() => {
                      setConfirmDeleteWorkspace(false);
                      setDeleteWorkspaceConfirmText("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginBottom: "1.2rem" }}>
            <Field label="Period" htmlFor="mp-period">
              <select id="mp-period" style={inputStyle} value={selectedStatementId} onChange={(e) => setSelectedStatementId(e.target.value)}>
                <option value="new">+ Add new period</option>
                {statements.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.period_label} ({s.period_type}, {s.basis})
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div style={{ marginBottom: "1.2rem" }}>
            <Field label="Review cycle (optional)" htmlFor="mp-cycle">
              <select id="mp-cycle" style={inputStyle} value={selectedReviewCycleId} onChange={(e) => setSelectedReviewCycleId(e.target.value)}>
                <option value="">— not attached to a review —</option>
                {reviewCycles.map((c) => (
                  <option key={c.id} value={c.id}>{c.label} ({c.status})</option>
                ))}
              </select>
            </Field>
            {reviewCycles.length === 0 && (
              <p style={{ fontSize: "0.75rem", color: T.inkSoft, marginTop: "0.4rem" }}>
                No review cycles started for this company yet. <a href="/sentinel/reviews" style={{ color: T.accent }}>Start one</a>.
              </p>
            )}
          </div>

          <ExtractUpload
            workspaceUnit={selectedWs?.currency_unit}
            basis={selectedWs?.comparison_basis ?? "consolidated"}
            onDraft={applyDraft}
            onError={(m) => setErrors(m ? [m] : [])}
            onUnauthenticated={() => router.push("/login")}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.2rem" }}>
            <Field label="Period type" htmlFor="mp-ptype">
              <select id="mp-ptype" style={inputStyle} value={periodType} onChange={(e) => setPeriodType(e.target.value)}>
                {PERIOD_TYPES.map((p) => (
                  <option key={p} value={p}>{p === "FY" ? "Full Year" : p}</option>
                ))}
              </select>
            </Field>
            <Field label="Period label" htmlFor="mp-plabel">
              <input id="mp-plabel" style={inputStyle} value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="e.g. FY27" maxLength={40} />
            </Field>
            <Field label="Period end date" htmlFor="mp-pend">
              <input id="mp-pend" type="date" style={inputStyle} value={periodEndDate} onChange={(e) => setPeriodEndDate(e.target.value)} />
            </Field>
            <Field label="Basis of these figures" htmlFor="mp-pbasis">
              <select id="mp-pbasis" style={inputStyle} value={basis} onChange={(e) => setBasis(e.target.value as Basis)}>
                {BASES.map((b) => (
                  <option key={b} value={b}>{b === "standalone" ? "Standalone" : "Consolidated"}</option>
                ))}
              </select>
            </Field>
          </div>

          <div style={{ height: 1, background: T.rule, margin: "0.4rem 0 1.2rem 0" }} />

          <StatementFields
            values={values}
            onChange={(key, v) => setValues((prev) => ({ ...prev, [key]: v }))}
            verify={verify}
            issues={issues}
            unitLabel={unitLabel(selectedWs?.currency_unit)}
            disabled={saving}
          />

          <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
            <button style={btnPrimary} onClick={saveStatement} disabled={saving}>
              {saving ? "Saving…" : selectedStatementId === "new" ? "Save new period" : "Update period"}
            </button>
            {selectedStatementId !== "new" && !confirmDeleteStatement && (
              <button style={{ ...linkBtn, color: T.accent }} onClick={() => setConfirmDeleteStatement(true)}>Delete this period</button>
            )}
            {confirmDeleteStatement && (
              <>
                <span style={{ fontSize: "0.82rem", color: T.inkSoft }}>Delete this period?</span>
                <button style={btnGhost} onClick={deleteStatement} disabled={deletingStatement}>
                  {deletingStatement ? "Deleting…" : "Yes, delete"}
                </button>
                <button style={{ ...linkBtn, color: T.inkSoft }} onClick={() => setConfirmDeleteStatement(false)}>Cancel</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
