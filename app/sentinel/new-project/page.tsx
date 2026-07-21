"use client";
export const dynamic = "force-dynamic";

// Sentinel — New Project. The self-service onboarding path: create a
// workspace, enter your first period's numbers directly (no ERP, no
// file extraction - deliberately manual for now, matching "data I'll
// input myself"). owner_id is set to the signed-in user, so RLS
// isolates this workspace from every other user automatically - no
// new policies needed, the existing "owner manages workspace"/
// "owner manages statements" policies already cover insert.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { SECTOR_CONFIGS } from "../lib/config";
import { SERIF, T } from "../lib/theme";

const CURRENCY_UNITS = [
  { value: "INR_CRORE", label: "\u20b9 Crore" },
  { value: "INR_LAKH", label: "\u20b9 Lakh" },
  { value: "INR", label: "\u20b9 (plain)" },
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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

// Income Statement fields collected on the second step - required
// fields match the database's NOT NULL constraints exactly, so a
// submission here can never fail on a missing-column error.
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

export default function NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  // Step 1 - workspace
  const [companyName, setCompanyName] = useState("");
  const [sector, setSector] = useState("general");
  const [industry, setIndustry] = useState("");
  const [fyStartMonth, setFyStartMonth] = useState(4);
  const [currencyUnit, setCurrencyUnit] = useState("INR_LAKH");
  const [comparisonBasis, setComparisonBasis] = useState<"standalone" | "consolidated">("standalone");

  // Step 2 - first statement
  const [periodType, setPeriodType] = useState<"FY" | "Q1" | "Q2" | "Q3" | "Q4">("FY");
  const [periodLabel, setPeriodLabel] = useState("");
  const [periodEndDate, setPeriodEndDate] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});

  async function createWorkspace() {
    setError(null);
    if (!companyName.trim()) {
      setError("Company name is required.");
      return;
    }
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      router.push("/login");
      return;
    }
    const { data, error: insertError } = await supabase
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
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setWorkspaceId(data.id);
    setStep(2);
  }

  async function createStatement() {
    setError(null);
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
    setSaving(true);
    const record: Record<string, unknown> = {
      workspace_id: workspaceId,
      period_type: periodType,
      period_label: periodLabel.trim(),
      period_end_date: periodEndDate,
      basis: comparisonBasis,
      revenue_from_operations: revenue,
      profit_before_tax: pbt,
      profit_after_tax: pat,
      source_file: "manual entry",
      source_page: null,
      extraction_notes: null,
    };
    for (const f of STATEMENT_FIELDS) {
      if (f.required) continue;
      const raw = values[f.key];
      record[f.key] = raw != null && raw !== "" ? parseFloat(raw) : null;
    }
    const { error: insertError } = await supabase.from("sentinel_statements").insert(record);
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setStep(3);
  }

  return (
    <div>
      <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0 }}>
        New Project
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
        Step {step} of 3 — {step === 1 ? "Company details" : step === 2 ? "First period's numbers" : "Done"} · visible only to you
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

      {step === 1 && (
        <div
          style={{
            background: T.card,
            border: `1px solid ${T.rule}`,
            borderRadius: 3,
            padding: "1.6rem 1.8rem",
            maxWidth: 640,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.2rem" }}>
            <Field label="Company name" span2>
              <input style={inputStyle} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Acme Manufacturing Pvt Ltd" />
            </Field>
            <Field label="Sector">
              <select style={inputStyle} value={sector} onChange={(e) => setSector(e.target.value)}>
                {Object.entries(SECTOR_CONFIGS).map(([key, cfg]) => (
                  <option key={key} value={key}>
                    {cfg.display_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Industry (optional)">
              <input style={inputStyle} value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Auto components" />
            </Field>
            <Field label="Fiscal year starts">
              <select style={inputStyle} value={fyStartMonth} onChange={(e) => setFyStartMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reporting unit">
              <select style={inputStyle} value={currencyUnit} onChange={(e) => setCurrencyUnit(e.target.value)}>
                {CURRENCY_UNITS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Basis">
              <select style={inputStyle} value={comparisonBasis} onChange={(e) => setComparisonBasis(e.target.value as "standalone" | "consolidated")}>
                <option value="standalone">Standalone</option>
                <option value="consolidated">Consolidated</option>
              </select>
            </Field>
          </div>
          <button style={btnPrimary} onClick={createWorkspace} disabled={saving}>
            {saving ? "Creating…" : "Continue"}
          </button>
        </div>
      )}

      {step === 2 && (
        <div
          style={{
            background: T.card,
            border: `1px solid ${T.rule}`,
            borderRadius: 3,
            padding: "1.6rem 1.8rem",
            maxWidth: 640,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.2rem" }}>
            <Field label="Period type">
              <select style={inputStyle} value={periodType} onChange={(e) => setPeriodType(e.target.value as typeof periodType)}>
                <option value="FY">Full Year</option>
                <option value="Q1">Q1</option>
                <option value="Q2">Q2</option>
                <option value="Q3">Q3</option>
                <option value="Q4">Q4</option>
              </select>
            </Field>
            <Field label="Period label">
              <input style={inputStyle} value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="e.g. FY26" />
            </Field>
            <Field label="Period end date" span2>
              <input type="date" style={inputStyle} value={periodEndDate} onChange={(e) => setPeriodEndDate(e.target.value)} />
            </Field>
          </div>

          <div style={{ height: 1, background: T.rule, margin: "0.4rem 0 1.2rem 0" }} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.2rem" }}>
            {STATEMENT_FIELDS.map((f) => (
              <Field key={f.key} label={f.label + (f.required ? " *" : "")}>
                <input
                  type="number"
                  step="0.01"
                  style={inputStyle}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder="0.00"
                />
              </Field>
            ))}
          </div>

          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button style={btnPrimary} onClick={createStatement} disabled={saving}>
              {saving ? "Saving…" : "Save & finish"}
            </button>
            <button style={btnGhost} onClick={() => setStep(1)} disabled={saving}>
              Back
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
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
            {companyName} is set up.
          </p>
          <p style={{ fontSize: "0.9rem", color: T.inkSoft, lineHeight: 1.6, marginBottom: "1.2rem" }}>
            This workspace is visible only to you. Add more periods any time to unlock YoY comparisons and trend
            charts — everything here works the same way it does for the demo companies.
          </p>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button style={btnPrimary} onClick={() => router.push("/sentinel/statements")}>
              View Financial Statements
            </button>
            <button style={btnGhost} onClick={() => router.push("/sentinel")}>
              Go to Investigation Queue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
