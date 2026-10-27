"use client";
export const dynamic = "force-dynamic";

// Sentinel — New Project. One screen, six answers, one button. It creates the project and opens its Overview,
// which is where the next step lives (upload a file or type the figures, with a checklist beside it). An
// empty project is a normal, removable state, exactly as in a database project: nothing is lost by creating one
// and nothing needs to be finished in this screen.
//
// owner_id is the signed-in user, so row-level security isolates the project from every other user.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { SECTOR_CONFIGS } from "../lib/config";
import { BASES } from "../lib/fields";
import { Field, inputStyle } from "../lib/StatementFields";
import { useShell } from "../lib/shell/ShellData";
import { SERIF, T } from "../lib/theme";
import { UNIT_OPTIONS, unitLabel } from "../lib/units";
import { setSelectedWorkspace } from "../lib/useSelectedWorkspace";
import type { Basis, Workspace } from "../lib/types";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const btnPrimary: React.CSSProperties = {
  fontFamily: "inherit", fontSize: "0.9rem", fontWeight: 500, padding: "0.65rem 1.5rem", border: `1px solid ${T.accent}`, borderRadius: 3, background: T.accent, color: T.background, cursor: "pointer",
};

export default function NewProjectPage() {
  const router = useRouter();
  const { reload } = useShell();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [sector, setSector] = useState("technology");
  const [industry, setIndustry] = useState("");
  const [fyStartMonth, setFyStartMonth] = useState(4);
  const [currencyUnit, setCurrencyUnit] = useState("INR_CRORE");
  const [comparisonBasis, setComparisonBasis] = useState<Basis>("consolidated");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const name = companyName.trim();
    if (!name) {
      setError("Give the project a name - normally the company's name.");
      return;
    }
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setSaving(false);
      router.push("/login");
      return;
    }
    const { data, error: insertError } = await supabase
      .from("sentinel_workspaces")
      .insert({
        owner_id: userData.user.id,
        company_name: name,
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
    if (insertError || !data) {
      setSaving(false);
      setError(insertError?.message ?? "Could not create the project.");
      return;
    }
    const created = data as Workspace;
    await reload();
    setSelectedWorkspace(created.id, { url: false });
    router.push(`/sentinel/projects/${created.id}`);
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0 }}>New project</h1>
      <p style={{ fontSize: "0.88rem", color: T.inkSoft, margin: "0.5rem 0 1.5rem 0", lineHeight: 1.55 }}>
        A project is one company. Only you can see it. After you create it you will add its figures - by uploading a filing or a
        spreadsheet, or by typing them - and Sentinel will tell you what is still missing.
      </p>

      {error && (
        <p role="alert" style={{ fontSize: "0.85rem", color: T.ink, background: T.accentSoft, borderLeft: `2px solid ${T.accent}`, padding: "0.6rem 0.9rem", marginBottom: "1.2rem" }}>
          {error}
        </p>
      )}

      <form onSubmit={create} style={{ background: T.card, border: `1px solid ${T.rule}`, borderRadius: 3, padding: "1.6rem 1.8rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.2rem" }}>
          <Field label="Company name" htmlFor="np-name" span2>
            <input id="np-name" style={inputStyle} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Acme Manufacturing Pvt Ltd" maxLength={120} autoFocus />
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
          <Field label="Compared on" htmlFor="np-basis">
            <select id="np-basis" style={inputStyle} value={comparisonBasis} onChange={(e) => setComparisonBasis(e.target.value as Basis)}>
              {BASES.map((b) => (
                <option key={b} value={b}>{b === "standalone" ? "Standalone" : "Consolidated"}</option>
              ))}
            </select>
          </Field>
        </div>
        <p style={{ fontSize: "0.75rem", color: T.inkSoft, margin: "0 0 1.3rem 0", lineHeight: 1.5 }}>
          Figures you enter for this project are read as {unitLabel(currencyUnit)}; files you upload in another unit are converted. You can show
          everything in crore, lakh or million at any time with the Display switch at the top - that never changes what is stored.
        </p>
        <button type="submit" style={btnPrimary} disabled={saving}>
          {saving ? "Creating..." : "Create project"}
        </button>
      </form>
    </div>
  );
}
