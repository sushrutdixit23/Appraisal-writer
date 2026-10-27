"use client";
export const dynamic = "force-dynamic";

// Sentinel — New Project. The self-service onboarding path: describe the company, then enter the first
// period's numbers - typed, or pre-filled from an uploaded PDF via Document Intelligence
// (/api/sentinel/extract). Either way this form is the single source of truth for what gets saved:
// extraction only pre-fills the fields, and a person reviews and edits before Save.
//
// The company is created only when the first statement has passed validation (and removed again if the
// statement then fails to save), so an abandoned or refused entry never leaves an empty company behind.
// owner_id is the signed-in user, so row-level security isolates the company from every other user.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { SECTOR_CONFIGS } from "../lib/config";
import { BASES, PERIOD_TYPES } from "../lib/fields";
import { ExtractUpload, type AppliedDraft } from "../lib/ExtractUpload";
import { Field, StatementFields, inputStyle } from "../lib/StatementFields";
import { SERIF, T } from "../lib/theme";
import { UNIT_OPTIONS, unitLabel } from "../lib/units";
import { prepareFromForm, type Issue } from "../lib/validate";
import type { Basis } from "../lib/types";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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

const card: React.CSSProperties = {
  background: T.card,
  border: `1px solid ${T.rule}`,
  borderRadius: 3,
  padding: "1.6rem 1.8rem",
  maxWidth: 640,
};

export default function NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // Step 1 - the company
  const [companyName, setCompanyName] = useState("");
  const [sector, setSector] = useState("general");
  const [industry, setIndustry] = useState("");
  const [fyStartMonth, setFyStartMonth] = useState(4);
  const [currencyUnit, setCurrencyUnit] = useState("INR_CRORE");
  const [comparisonBasis, setComparisonBasis] = useState<Basis>("consolidated");

  // Step 2 - the first statement
  const [periodType, setPeriodType] = useState<string>("FY");
  const [periodLabel, setPeriodLabel] = useState("");
  const [periodEndDate, setPeriodEndDate] = useState("");
  const [basis, setBasis] = useState<Basis>("consolidated");
  const [values, setValues] = useState<Record<string, string>>({});
  const [sourceFile, setSourceFile] = useState("manual entry");
  const [extractionNotes, setExtractionNotes] = useState<string | null>(null);
  const [verify, setVerify] = useState<string[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);

  // Step 3
  const [saveWarnings, setSaveWarnings] = useState<string[]>([]);

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

  function continueToNumbers() {
    setErrors([]);
    if (!companyName.trim()) {
      setErrors(["Company name is required."]);
      return;
    }
    setBasis(comparisonBasis);
    setStep(2);
  }

  async function save() {
    setErrors([]);
    const prepared = prepareFromForm(
      { periodType, periodLabel: periodLabel.trim(), periodEndDate, basis, values, sourceFile, extractionNotes },
      [] // a brand-new company has no other statements to compare with
    );
    setIssues([...prepared.issues]);
    if (!prepared.row) {
      setErrors(prepared.errors);
      return;
    }
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setSaving(false);
      router.push("/login");
      return;
    }

    const { data: workspace, error: wsError } = await supabase
      .from("sentinel_workspaces")
      .insert({
        owner_id: userData.user.id,
        company_name: companyName.trim(),
        sector,
        industry: industry.trim() || null,
        is_public_reference: false,
        fiscal_year_start_month: fyStartMonth,
        currency: "INR",
        currency_unit: currencyUnit,
        comparison_basis: comparisonBasis,
      })
      .select()
      .single();
    if (wsError || !workspace) {
      setSaving(false);
      setErrors([wsError?.message ?? "Could not create the company."]);
      return;
    }

    const { error: stmtError } = await supabase
      .from("sentinel_statements")
      .insert({ ...prepared.row, workspace_id: workspace.id });
    if (stmtError) {
      // Do not leave an empty company behind because its first statement could not be saved.
      await supabase.from("sentinel_workspaces").delete().eq("id", workspace.id);
      setSaving(false);
      setErrors([stmtError.message]);
      return;
    }
    setSaving(false);
    setSaveWarnings(prepared.warnings);
    setStep(3);
  }

  return (
    <div>
      <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0 }}>New Project</h1>
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
        Step {step} of 3 — {step === 1 ? "Company details" : step === 2 ? "First period's numbers" : "Done"} · visible only to you
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

      {step === 1 && (
        <div style={card}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.2rem" }}>
            <Field label="Company name" htmlFor="np-name" span2>
              <input id="np-name" style={inputStyle} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Acme Manufacturing Pvt Ltd" maxLength={120} />
            </Field>
            <Field label="Sector" htmlFor="np-sector">
              <select id="np-sector" style={inputStyle} value={sector} onChange={(e) => setSector(e.target.value)}>
                {Object.entries(SECTOR_CONFIGS).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.display_name}</option>
                ))}
              </select>
            </Field>
            <Field label="Industry (optional)" htmlFor="np-industry">
              <input id="np-industry" style={inputStyle} value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Auto components" maxLength={80} />
            </Field>
            <Field label="Fiscal year starts" htmlFor="np-fy">
              <select id="np-fy" style={inputStyle} value={fyStartMonth} onChange={(e) => setFyStartMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </Field>
            <Field label="Reporting unit" htmlFor="np-unit">
              <select id="np-unit" style={inputStyle} value={currencyUnit} onChange={(e) => setCurrencyUnit(e.target.value)}>
                {UNIT_OPTIONS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Basis" htmlFor="np-basis">
              <select id="np-basis" style={inputStyle} value={comparisonBasis} onChange={(e) => setComparisonBasis(e.target.value as Basis)}>
                {BASES.map((b) => (
                  <option key={b} value={b}>{b === "standalone" ? "Standalone" : "Consolidated"}</option>
                ))}
              </select>
            </Field>
          </div>
          <p style={{ fontSize: "0.75rem", color: T.inkSoft, margin: "0 0 1.2rem 0", lineHeight: 1.5 }}>
            Every figure you enter is read as {unitLabel(currencyUnit)}. Companies are compared with each other in crore, so a lakh or million company still lines up with the rest.
          </p>
          <button style={btnPrimary} onClick={continueToNumbers}>Continue</button>
        </div>
      )}

      {step === 2 && (
        <div style={card}>
          <ExtractUpload
            workspaceUnit={currencyUnit}
            basis={comparisonBasis}
            onDraft={applyDraft}
            onError={(m) => setErrors(m ? [m] : [])}
            onUnauthenticated={() => router.push("/login")}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.2rem" }}>
            <Field label="Period type" htmlFor="np-ptype">
              <select id="np-ptype" style={inputStyle} value={periodType} onChange={(e) => setPeriodType(e.target.value)}>
                {PERIOD_TYPES.map((p) => (
                  <option key={p} value={p}>{p === "FY" ? "Full Year" : p}</option>
                ))}
              </select>
            </Field>
            <Field label="Period label" htmlFor="np-plabel">
              <input id="np-plabel" style={inputStyle} value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="e.g. FY26" maxLength={40} />
            </Field>
            <Field label="Period end date" htmlFor="np-pend">
              <input id="np-pend" type="date" style={inputStyle} value={periodEndDate} onChange={(e) => setPeriodEndDate(e.target.value)} />
            </Field>
            <Field label="Basis of these figures" htmlFor="np-pbasis">
              <select id="np-pbasis" style={inputStyle} value={basis} onChange={(e) => setBasis(e.target.value as Basis)}>
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
            unitLabel={unitLabel(currencyUnit)}
            disabled={saving}
          />

          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button style={btnPrimary} onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save & finish"}
            </button>
            <button style={btnGhost} onClick={() => setStep(1)} disabled={saving}>Back</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={card}>
          <p style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.2rem", margin: "0 0 0.6rem 0" }}>{companyName} is set up.</p>
          <p style={{ fontSize: "0.9rem", color: T.inkSoft, lineHeight: 1.6, marginBottom: "1.2rem" }}>
            This workspace is visible only to you. Add more periods any time to unlock YoY comparisons and trend charts — everything here works the same way it does for the demo companies.
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
            <button style={btnPrimary} onClick={() => router.push("/sentinel/statements")}>View Financial Statements</button>
            <button style={btnGhost} onClick={() => router.push("/sentinel")}>Go to Investigation Queue</button>
          </div>
        </div>
      )}
    </div>
  );
}
