"use client";
export const dynamic = "force-dynamic";

// Sentinel — Manage Periods (route stays /sentinel/add-period). Started
// as add-only; now full CRUD for statements (add/edit/delete) plus
// rename/delete for the company itself - the first place in the app
// that isn't create-and-read-only. Reuses the same statement-entry form
// and Document Intelligence upload regardless of add vs. edit mode.
//
// Delete-workspace deliberately deletes dependent sentinel_investigations
// and sentinel_statements rows explicitly in application code before
// deleting the workspace row, rather than relying on the database having
// ON DELETE CASCADE configured - that's safe either way, but only
// correct without it if we don't assume it. If the underlying RLS
// policies only grant INSERT/SELECT to owners (not UPDATE/DELETE), these
// calls will surface a visible permission error via setError rather than
// silently no-op - not verified from here, worth checking if deletes/
// edits fail.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { SERIF, T } from "../lib/theme";
import type { FinancialStatement, Workspace } from "../lib/types";

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

const STATEMENT_FIELDS: {
  key: string;
  label: string;
  required?: boolean;
}[] = [
  { key: "revenue_from_operations", label: "Revenue from Operations", required: true },
  { key: "other_income", label: "Other Income" },
  { key: "total_income", label: "Total Income" },
  { key: "total_expenses", label: "Total Expenses" },
  { key: "ebitda", label: "EBITDA" },
  { key: "depreciation_amortisation", label: "Depreciation & Amortisation" },
  { key: "finance_costs", label: "Finance Costs" },
  { key: "exceptional_items", label: "Exceptional Items" },
  { key: "profit_before_tax", label: "Profit Before Tax", required: true },
  { key: "tax_expense", label: "Tax Expense" },
  { key: "profit_after_tax", label: "Profit After Tax", required: true },
];

// Balance Sheet fields - optional, feed the liquidity/leverage/working-
// capital checks added to anomaly.ts. Scoped to exactly the 7 fields
// those checks actually use (current_ratio, debt_to_equity, inventory/
// receivable/payable days) - not the full Balance Sheet schema, matching
// how STATEMENT_FIELDS above is scoped to what's actually consumed.
const BALANCE_SHEET_FIELDS: {
  key: string;
  label: string;
}[] = [
  { key: "current_assets", label: "Current Assets" },
  { key: "current_liabilities", label: "Current Liabilities" },
  { key: "inventory", label: "Inventory" },
  { key: "trade_receivables", label: "Trade Receivables" },
  { key: "trade_payables", label: "Trade Payables" },
  { key: "total_debt", label: "Total Debt" },
  { key: "total_equity", label: "Total Equity" },
];

const ALL_FIELD_KEYS = [...STATEMENT_FIELDS, ...BALANCE_SHEET_FIELDS].map((f) => f.key);

export default function AddPeriodPage() {
  const router = useRouter();
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [done, setDone] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);

  const [periodType, setPeriodType] = useState<"FY" | "Q1" | "Q2" | "Q3" | "Q4">("FY");
  const [periodLabel, setPeriodLabel] = useState("");
  const [periodEndDate, setPeriodEndDate] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});

  const [extracting, setExtracting] = useState(false);
  const [sourceFile, setSourceFile] = useState("manual entry");
  const [extractionNotes, setExtractionNotes] = useState<string | null>(null);
  const [lowConfidenceFields, setLowConfidenceFields] = useState<string[]>([]);

  // Statement CRUD - "new" means the form is building an insert; any
  // other value is the id of an existing sentinel_statements row being
  // edited, and Save switches to an update.
  const [statements, setStatements] = useState<FinancialStatement[]>([]);
  const [selectedStatementId, setSelectedStatementId] = useState<string>("new");
  const [confirmDeleteStatement, setConfirmDeleteStatement] = useState(false);
  const [deletingStatement, setDeletingStatement] = useState(false);

  // Company rename/delete.
  const [editingCompanyName, setEditingCompanyName] = useState(false);
  const [companyNameDraft, setCompanyNameDraft] = useState("");
  const [savingCompanyName, setSavingCompanyName] = useState(false);
  const [confirmDeleteWorkspace, setConfirmDeleteWorkspace] = useState(false);
  const [deleteWorkspaceConfirmText, setDeleteWorkspaceConfirmText] = useState("");
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);

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

  // Load this company's existing periods whenever the selected company
  // changes, and reset the form back to "add new period".
  useEffect(() => {
    if (!workspaceId) {
      setStatements([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("sentinel_statements")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("period_end_date", { ascending: false });
      setStatements((data ?? []) as FinancialStatement[]);
      setSelectedStatementId("new");
    })();
  }, [workspaceId]);

  // Prefill (or clear) the form whenever which period is selected
  // changes. Intentionally doesn't depend on `statements` - by the time
  // a person can pick an existing period from the dropdown, that list
  // has already loaded.
  useEffect(() => {
    if (selectedStatementId === "new") {
      setPeriodType("FY");
      setPeriodLabel("");
      setPeriodEndDate("");
      setValues({});
      setSourceFile("manual entry");
      setExtractionNotes(null);
      setLowConfidenceFields([]);
      return;
    }
    const stmt = statements.find((s) => s.id === selectedStatementId);
    if (!stmt) return;
    setPeriodType(stmt.period_type);
    setPeriodLabel(stmt.period_label);
    setPeriodEndDate(stmt.period_end_date);
    const prefill: Record<string, string> = {};
    for (const key of ALL_FIELD_KEYS) {
      const v = (stmt as unknown as Record<string, number | null>)[key];
      if (v != null) prefill[key] = String(v);
    }
    setValues(prefill);
    setSourceFile(stmt.source_file);
    setExtractionNotes(stmt.extraction_notes);
    setLowConfidenceFields([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStatementId]);

  async function handleExtract(file: File) {
    setError(null);
    setExtracting(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setExtracting(false);
      router.push("/login");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/sentinel/extract", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error ?? "Extraction failed.");
        setExtracting(false);
        return;
      }
      if (result.period_type) setPeriodType(result.period_type);
      if (result.period_label) setPeriodLabel(result.period_label);
      if (result.period_end_date) setPeriodEndDate(result.period_end_date);
      const extracted: Record<string, string> = {};
      for (const key of Object.keys(result.fields ?? {})) {
        const v = result.fields[key];
        if (v != null) extracted[key] = String(v);
      }
      setValues((prev) => ({ ...prev, ...extracted }));
      setExtractionNotes(result.extraction_notes ?? null);
      setLowConfidenceFields(result.low_confidence_fields ?? []);
      setSourceFile(result.source_file ?? file.name);
    } catch {
      setError("Could not reach the extraction service. Please enter the figures manually.");
    }
    setExtracting(false);
  }

  async function saveStatement() {
    setError(null);
    if (!workspaceId) {
      setError("Select a company first.");
      return;
    }
    if (!periodLabel.trim() || !periodEndDate) {
      setError("Period label and period end date are required.");
      return;
    }
    const revenue = parseFloat(values["revenue_from_operations"]);
    const pbt = parseFloat(values["profit_before_tax"]);
    const pat = parseFloat(values["profit_after_tax"]);
    if (Number.isNaN(revenue) || Number.isNaN(pbt) || Number.isNaN(pat)) {
      setError("Revenue, Profit Before Tax, and Profit After Tax are required numbers.");
      return;
    }
    const ws = workspaces.find((w) => w.id === workspaceId);
    if (!ws) {
      setError("Selected company not found.");
      return;
    }
    setSaving(true);
    const record: Record<string, unknown> = {
      workspace_id: workspaceId,
      period_type: periodType,
      period_label: periodLabel.trim(),
      period_end_date: periodEndDate,
      basis: ws.comparison_basis,
      revenue_from_operations: revenue,
      profit_before_tax: pbt,
      profit_after_tax: pat,
      source_file: sourceFile,
      source_page: null,
      extraction_notes: extractionNotes,
    };
    for (const f of STATEMENT_FIELDS) {
      if (f.required) continue;
      const raw = values[f.key];
      record[f.key] = raw != null && raw !== "" ? parseFloat(raw) : null;
    }
    for (const f of BALANCE_SHEET_FIELDS) {
      const raw = values[f.key];
      record[f.key] = raw != null && raw !== "" ? parseFloat(raw) : null;
    }

    if (selectedStatementId === "new") {
      const { error: insertError } = await supabase.from("sentinel_statements").insert(record);
      setSaving(false);
      if (insertError) {
        setError(insertError.message);
        return;
      }
      setJustUpdated(false);
    } else {
      const { error: updateError } = await supabase
        .from("sentinel_statements")
        .update(record)
        .eq("id", selectedStatementId);
      setSaving(false);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setJustUpdated(true);
    }
    setDone(true);
  }

  async function deleteStatement() {
    if (selectedStatementId === "new") return;
    setDeletingStatement(true);
    const { error: deleteError } = await supabase
      .from("sentinel_statements")
      .delete()
      .eq("id", selectedStatementId);
    setDeletingStatement(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setStatements((prev) => prev.filter((s) => s.id !== selectedStatementId));
    setSelectedStatementId("new");
    setConfirmDeleteStatement(false);
  }

  async function saveCompanyName() {
    if (!companyNameDraft.trim()) {
      setError("Company name can't be empty.");
      return;
    }
    setSavingCompanyName(true);
    const { error: updateError } = await supabase
      .from("sentinel_workspaces")
      .update({ company_name: companyNameDraft.trim() })
      .eq("id", workspaceId);
    setSavingCompanyName(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === workspaceId ? { ...w, company_name: companyNameDraft.trim() } : w))
    );
    setEditingCompanyName(false);
  }

  async function deleteWorkspace() {
    const ws = workspaces.find((w) => w.id === workspaceId);
    if (!ws) return;
    if (deleteWorkspaceConfirmText.trim() !== ws.company_name) {
      setError("Type the company name exactly to confirm deletion.");
      return;
    }
    setDeletingWorkspace(true);
    await supabase.from("sentinel_investigations").delete().eq("workspace_id", workspaceId);
    await supabase.from("sentinel_statements").delete().eq("workspace_id", workspaceId);
    const { error: deleteError } = await supabase.from("sentinel_workspaces").delete().eq("id", workspaceId);
    setDeletingWorkspace(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setWorkspaces((prev) => prev.filter((w) => w.id !== workspaceId));
    setWorkspaceId("");
    setConfirmDeleteWorkspace(false);
    setDeleteWorkspaceConfirmText("");
  }

  if (loadingWorkspaces) return <p style={{ color: T.inkSoft }}>Loading Sentinel…</p>;

  if (workspaces.length === 0) {
    return (
      <div>
        <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0 }}>
          Manage Periods
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
        Manage Periods
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
        Add, edit, or delete a period for a company you already created
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

      {done ? (
        <div
          style={{
            background: T.card,
            border: `1px solid ${T.rule}`,
            borderRadius: 3,
            padding: "1.6rem 1.8rem",
            maxWidth: 640,
          }}
        >
          <p style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.2rem", margin: "0 0 0.6rem 0" }}>
            {justUpdated ? "Period updated." : "Period added."}
          </p>
          <p style={{ fontSize: "0.9rem", color: T.inkSoft, lineHeight: 1.6, marginBottom: "1.2rem" }}>
            {selectedWs?.company_name} now reflects this change. Trend charts and YoY comparisons
            update automatically wherever this company appears.
          </p>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button style={btnPrimary} onClick={() => router.push("/sentinel/kpi")}>
              View KPI Dashboard
            </button>
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
        <div
          style={{
            background: T.card,
            border: `1px solid ${T.rule}`,
            borderRadius: 3,
            padding: "1.6rem 1.8rem",
            maxWidth: 640,
          }}
        >
          <div style={{ marginBottom: "1.2rem" }}>
            <Field label="Company">
              <select style={inputStyle} value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.company_name}
                  </option>
                ))}
              </select>
            </Field>

            {workspaceId && (
              <div style={{ marginTop: "0.6rem", display: "flex", gap: "0.9rem", alignItems: "center", flexWrap: "wrap" }}>
                {editingCompanyName ? (
                  <>
                    <input
                      style={{ ...inputStyle, width: 220 }}
                      value={companyNameDraft}
                      onChange={(e) => setCompanyNameDraft(e.target.value)}
                    />
                    <button style={{ ...linkBtn, color: T.ink }} onClick={saveCompanyName} disabled={savingCompanyName}>
                      {savingCompanyName ? "Saving…" : "Save name"}
                    </button>
                    <button style={{ ...linkBtn, color: T.inkSoft }} onClick={() => setEditingCompanyName(false)}>
                      Cancel
                    </button>
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
                  <button style={{ ...linkBtn, color: T.accent }} onClick={() => setConfirmDeleteWorkspace(true)}>
                    Delete company…
                  </button>
                )}
              </div>
            )}

            {confirmDeleteWorkspace && (
              <div
                style={{
                  marginTop: "0.8rem",
                  padding: "0.9rem 1rem",
                  border: `1px solid ${T.accent}`,
                  background: T.accentSoft,
                }}
              >
                <p style={{ fontSize: "0.82rem", margin: "0 0 0.6rem 0", lineHeight: 1.5 }}>
                  This permanently deletes <strong>{selectedWs?.company_name}</strong> and every period and
                  investigation under it. Type the company name to confirm.
                </p>
                <input
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
            <Field label="Period">
              <select
                style={inputStyle}
                value={selectedStatementId}
                onChange={(e) => setSelectedStatementId(e.target.value)}
              >
                <option value="new">+ Add new period</option>
                {statements.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.period_label} ({s.period_type})
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div
            style={{
              border: `1px dashed ${T.rule}`,
              borderRadius: 3,
              padding: "1rem 1.2rem",
              marginBottom: "1.2rem",
              background: T.background,
            }}
          >
            <p style={{ fontSize: "0.78rem", color: T.inkSoft, margin: "0 0 0.6rem 0", lineHeight: 1.5 }}>
              Optional — upload a text-based PDF filing to pre-fill the fields below. Scanned/image-only
              PDFs aren&apos;t supported yet; enter those manually.
            </p>
            <input
              type="file"
              accept="application/pdf"
              disabled={extracting}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleExtract(file);
                e.target.value = "";
              }}
              style={{ fontSize: "0.85rem" }}
            />
            {extracting && (
              <p style={{ fontSize: "0.8rem", color: T.accent, margin: "0.6rem 0 0 0" }}>
                Reading filing and extracting figures…
              </p>
            )}
            {extractionNotes && !extracting && (
              <p style={{ fontSize: "0.78rem", color: T.inkSoft, margin: "0.6rem 0 0 0", lineHeight: 1.5 }}>
                Extraction notes: {extractionNotes}
              </p>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.2rem" }}>
            <Field label="Period type">
              <select
                style={inputStyle}
                value={periodType}
                onChange={(e) => setPeriodType(e.target.value as typeof periodType)}
              >
                <option value="FY">Full Year</option>
                <option value="Q1">Q1</option>
                <option value="Q2">Q2</option>
                <option value="Q3">Q3</option>
                <option value="Q4">Q4</option>
              </select>
            </Field>
            <Field label="Period label">
              <input
                style={inputStyle}
                value={periodLabel}
                onChange={(e) => setPeriodLabel(e.target.value)}
                placeholder="e.g. FY27"
              />
            </Field>
            <Field label="Period end date" span2>
              <input
                type="date"
                style={inputStyle}
                value={periodEndDate}
                onChange={(e) => setPeriodEndDate(e.target.value)}
              />
            </Field>
          </div>

          <div style={{ height: 1, background: T.rule, margin: "0.4rem 0 1.2rem 0" }} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.2rem" }}>
            {STATEMENT_FIELDS.map((f) => {
              const isLowConfidence = lowConfidenceFields.includes(f.key);
              return (
                <Field
                  key={f.key}
                  label={f.label + (f.required ? " *" : "") + (isLowConfidence ? " (verify)" : "")}
                >
                  <input
                    type="number"
                    step="0.01"
                    style={{ ...inputStyle, borderColor: isLowConfidence ? T.accent : T.rule }}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder="0.00"
                  />
                </Field>
              );
            })}
          </div>

          <div style={{ height: 1, background: T.rule, margin: "0.4rem 0 1.2rem 0" }} />

          <p
            style={{
              fontSize: "0.7rem",
              fontWeight: 500,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: T.inkSoft,
              margin: "0 0 0.8rem 0",
            }}
          >
            Balance Sheet (optional) - unlocks liquidity, leverage, and working-capital checks
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.2rem" }}>
            {BALANCE_SHEET_FIELDS.map((f) => {
              const isLowConfidence = lowConfidenceFields.includes(f.key);
              return (
                <Field
                  key={f.key}
                  label={f.label + (isLowConfidence ? " (verify)" : "")}
                >
                  <input
                    type="number"
                    step="0.01"
                    style={{ ...inputStyle, borderColor: isLowConfidence ? T.accent : T.rule }}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder="0.00"
                  />
                </Field>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
            <button style={btnPrimary} onClick={saveStatement} disabled={saving}>
              {saving ? "Saving…" : selectedStatementId === "new" ? "Save new period" : "Update period"}
            </button>
            {selectedStatementId !== "new" && !confirmDeleteStatement && (
              <button style={{ ...linkBtn, color: T.accent }} onClick={() => setConfirmDeleteStatement(true)}>
                Delete this period
              </button>
            )}
            {confirmDeleteStatement && (
              <>
                <span style={{ fontSize: "0.82rem", color: T.inkSoft }}>Delete this period?</span>
                <button style={btnGhost} onClick={deleteStatement} disabled={deletingStatement}>
                  {deletingStatement ? "Deleting…" : "Yes, delete"}
                </button>
                <button style={{ ...linkBtn, color: T.inkSoft }} onClick={() => setConfirmDeleteStatement(false)}>
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
