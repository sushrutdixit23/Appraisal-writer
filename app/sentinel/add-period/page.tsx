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

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { sortWorkspaces } from "../lib/access";
import { BASES, PERIOD_TYPES, statementToFormValues, withoutUnsetOptionalColumns } from "../lib/fields";
import { AutofillUpload, type AutofillApplied } from "../lib/AutofillUpload";
import { serialiseChecks } from "../lib/autofill/annualChecks";
import { applyAutofillPeriod, countFields } from "../lib/autofill/apply";
import type { AutofillResult } from "../lib/autofill/types";
import { Field, StatementFields, inputStyle } from "../lib/StatementFields";
import { SERIF, T } from "../lib/theme";
import { unitLabel, type CurrencyUnit } from "../lib/units";
import { useSelectedWorkspace } from "../lib/useSelectedWorkspace";
import { prepareFromForm, type Issue } from "../lib/validate";
import type { Basis, FinancialStatement, ReviewCycle, Workspace } from "../lib/types";

const btnPrimary: React.CSSProperties = {
  fontFamily: "inherit",
  fontSize: "0.88rem",
  fontWeight: 500,
  padding: "0.6rem 1.4rem",
  border: `1px solid ${T.accent}`,
  borderRadius: 3,
  background: T.accent,
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
  const [keyAuditMattersText, setKeyAuditMattersText] = useState<string | null>(null);
  // Carried with the statement so editing a figure by hand does not wipe what the auditor's report said (see lib/autofill/annualChecks.ts).
  const [annualReportChecks, setAnnualReportChecks] = useState<string | null>(null);
  const [verify, setVerify] = useState<string[]>([]);
  const [sources, setSources] = useState<Record<string, string>>({});
  const [issues, setIssues] = useState<Issue[]>([]);
  const [saveWarnings, setSaveWarnings] = useState<string[]>([]);

  // A file can hold more than one period (a multi-year filing, a sheet with several columns); this form
  // fills and saves one at a time, so after a save we offer the others from the same file rather than
  // silently leaving them unsaved - the gap that made it look like only one year had been "extracted".
  const [autofillResult, setAutofillResult] = useState<AutofillResult | null>(null);
  const [autofillUnit, setAutofillUnit] = useState<CurrencyUnit | "">("");
  const [autofillPeriodKey, setAutofillPeriodKey] = useState<string | null>(null);
  const [usedPeriodKeys, setUsedPeriodKeys] = useState<Set<string>>(new Set());

  // "new" means the form is building an insert; any other value is the id of the statement being edited.
  const [statements, setStatements] = useState<FinancialStatement[]>([]);
  const [selectedStatementId, setSelectedStatementId] = useState<string>("new");
  const [confirmDeleteStatement, setConfirmDeleteStatement] = useState(false);
  const [deletingStatement, setDeletingStatement] = useState(false);

  const [reviewCycles, setReviewCycles] = useState<ReviewCycle[]>([]);
  const [selectedReviewCycleId, setSelectedReviewCycleId] = useState<string>("");

  const selectedWs = workspaces.find((w) => w.id === workspaceId);

  // A different company is a different file context - any "this file also has..." hint from the last one
  // no longer applies.
  useEffect(() => {
    setAutofillResult(null);
    setAutofillUnit("");
    setAutofillPeriodKey(null);
    setUsedPeriodKeys(new Set());
  }, [workspaceId]);

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

  // A link from a project's Overview can name the period to open (?statement=<id>); used once, on arrival.
  const wantedStatement = useRef<string | null>(null);
  useEffect(() => {
    wantedStatement.current = new URLSearchParams(window.location.search).get("statement");
  }, []);

  const reloadStatements = useCallback(async (id: string): Promise<FinancialStatement[]> => {
    const { data, error } = await supabase
      .from("sentinel_statements")
      .select("*")
      .eq("workspace_id", id)
      .order("period_end_date", { ascending: false });
    if (error) {
      setErrors([error.message]);
      return [];
    }
    const list = (data ?? []) as FinancialStatement[];
    setStatements(list);
    return list;
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
      const list = await reloadStatements(workspaceId);
      const wanted = wantedStatement.current;
      wantedStatement.current = null;
      if (wanted && list.some((x) => x.id === wanted)) setSelectedStatementId(wanted);
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
    setSources({});
    if (selectedStatementId === "new") {
      setPeriodType("FY");
      setPeriodLabel("");
      setPeriodEndDate("");
      setBasis(selectedWs?.comparison_basis ?? "consolidated");
      setValues({});
      setSourceFile("manual entry");
      setExtractionNotes(null);
      setKeyAuditMattersText(null);
      setAnnualReportChecks(null);
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
    setKeyAuditMattersText(stmt.key_audit_matters_text ?? null);
    setAnnualReportChecks(stmt.annual_report_checks ?? null);
    setSelectedReviewCycleId(stmt.review_cycle_id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStatementId, statements, selectedWs?.id]);

  function fillFormFrom(period: AutofillResult["periods"][number], applied: ReturnType<typeof applyAutofillPeriod>, result: AutofillResult) {
    if (period.period_type) setPeriodType(period.period_type);
    if (period.period_label) setPeriodLabel(period.period_label);
    if (period.period_end_date) setPeriodEndDate(period.period_end_date);
    if (period.basis) setBasis(period.basis);
    setValues(applied.values);
    setVerify(applied.verify);
    setSources(applied.sources);
    setSourceFile(result.source_file);
    setExtractionNotes(
      [`Filled from ${result.source_file} by rules (no AI).`, applied.unitNote, ...result.notes, ...period.notes].filter(Boolean).join(" ") || null
    );
    setKeyAuditMattersText(result.key_audit_matters_text);
    setAnnualReportChecks(period.period_type === "FY" && result.annual_report_checks ? serialiseChecks(result.annual_report_checks) : null);
    setIssues([]);
    setAutofillPeriodKey(period.key);
  }

  function applyAutofill({ period, applied, result, fileUnit }: AutofillApplied) {
    fillFormFrom(period, applied, result);
    setAutofillResult(result);
    setAutofillUnit(fileUnit);
    setUsedPeriodKeys(new Set());
  }

  /** A file can hold several periods; this loads another one straight from what was already read, no
   * re-upload needed, so saving one does not quietly leave the rest sitting unsaved in the file. */
  function loadOtherPeriod(key: string) {
    if (!autofillResult) return;
    const period = autofillResult.periods.find((p) => p.key === key);
    if (!period) return;
    const applied = applyAutofillPeriod(period, autofillUnit || null, selectedWs?.currency_unit);
    fillFormFrom(period, applied, autofillResult);
    setDone(false);
  }

  function applyAiFill({
    values: filled,
    sources: more,
    notes,
    keyAuditMattersText: aiKam,
  }: { values: Record<string, string>; sources: Record<string, string>; notes: string | null; keyAuditMattersText: string | null }) {
    setValues((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(filled)) if ((next[k] ?? "").trim() === "") next[k] = v;
      return next;
    });
    setVerify((prev) => [...new Set([...prev, ...Object.keys(filled)])]);
    setSources((prev) => ({ ...prev, ...more }));
    if (notes) setExtractionNotes((prev) => [prev, `AI reading: ${notes}`].filter(Boolean).join(" "));
    if (aiKam) setKeyAuditMattersText((prev) => prev ?? aiKam);
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
      { periodType, periodLabel: label, periodEndDate, basis, values, sourceFile, extractionNotes, keyAuditMattersText, annualReportChecks },
      others
    );
    setIssues([...prepared.issues]);
    if (!prepared.row) {
      setErrors(prepared.errors);
      return;
    }

    const record = withoutUnsetOptionalColumns(
      { ...prepared.row, workspace_id: workspaceId, review_cycle_id: selectedReviewCycleId || null },
      editingId ? statements.find((s) => s.id === editingId) : null
    );
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
    if (autofillPeriodKey) setUsedPeriodKeys((prev) => new Set(prev).add(autofillPeriodKey));
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

  const remainingPeriods = autofillResult?.periods.filter((p) => !usedPeriodKeys.has(p.key)) ?? [];

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
          {remainingPeriods.length > 0 && (
            <div style={{ background: T.accentSoft, borderLeft: `2px solid ${T.ochre}`, padding: "0.7rem 0.9rem", marginBottom: "1.2rem" }}>
              <p style={{ fontSize: "0.75rem", fontWeight: 600, color: T.ink, margin: "0 0 0.4rem 0" }}>
                {autofillResult?.source_file} also has {remainingPeriods.length} more period{remainingPeriods.length === 1 ? "" : "s"} not yet saved:
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {remainingPeriods.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    style={{ ...btnGhost, padding: "0.4rem 0.9rem", fontSize: "0.8rem" }}
                    onClick={() => loadOtherPeriod(p.key)}
                  >
                    Fill the form with {p.period_label ?? "this period"} ({countFields(p)} figures)
                  </button>
                ))}
              </div>
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
              <p style={{ fontSize: "0.75rem", color: T.inkSoft, margin: "0.4rem 0 0 0" }}>
                To rename, change the unit or delete this project, open its{" "}
                <a href={`/sentinel/projects/${workspaceId}/settings`} style={{ color: T.accent }}>Settings</a>.
              </p>
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

          <AutofillUpload
            workspaceUnit={selectedWs?.currency_unit}
            basis={selectedWs?.comparison_basis ?? "consolidated"}
            fyStartMonth={selectedWs?.fiscal_year_start_month}
            getValues={() => values}
            onApply={applyAutofill}
            onAiFill={applyAiFill}
            onError={(m) => setErrors(m ? [m] : [])}
            onUnauthenticated={() => router.push("/login")}
            multiHint={<a href={`/sentinel/projects/${workspaceId}/import`} style={{ color: T.accent }}>Import all periods instead</a>}
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
            sources={sources}
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
