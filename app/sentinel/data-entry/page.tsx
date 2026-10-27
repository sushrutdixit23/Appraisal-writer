"use client";
export const dynamic = "force-dynamic";

// Sentinel — Data Entry (server-validated path). Unlike New Project and Manage Periods, which write to the
// database from the browser, this page posts to /api/sentinel/statement, so the save runs the server's own
// ownership and accounting checks. It uses the same fields as the other two entry paths (fields.ts) and
// the same form component, and picks the company from a list of the ones you own instead of asking for a
// pasted workspace id. Not linked from the sidebar - New Project and Manage Periods are the main routes.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { sortWorkspaces } from "../lib/access";
import { SECTOR_CONFIGS } from "../lib/config";
import { BASES, PERIOD_TYPES } from "../lib/fields";
import { Field, StatementFields, inputStyle } from "../lib/StatementFields";
import { SERIF, T } from "../lib/theme";
import { UNIT_OPTIONS, unitLabel } from "../lib/units";
import { prepareFromForm, type Issue } from "../lib/validate";
import type { Basis, Workspace } from "../lib/types";

type Mode = "new" | "existing";

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

export default function DataEntryPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("new");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  const [companyName, setCompanyName] = useState("");
  const [sector, setSector] = useState("general");
  const [industry, setIndustry] = useState("");
  const [currencyUnit, setCurrencyUnit] = useState("INR_CRORE");
  const [comparisonBasis, setComparisonBasis] = useState<Basis>("consolidated");
  const [existingId, setExistingId] = useState("");

  const [periodType, setPeriodType] = useState<string>("FY");
  const [periodLabel, setPeriodLabel] = useState("");
  const [periodEndDate, setPeriodEndDate] = useState("");
  const [basis, setBasis] = useState<Basis>("consolidated");
  const [values, setValues] = useState<Record<string, string>>({});
  const [sourceFile, setSourceFile] = useState("");

  const [issues, setIssues] = useState<Issue[]>([]);
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push("/login");
        return;
      }
      const userId = sessionData.session.user.id;
      const { data } = await supabase.from("sentinel_workspaces").select("*").eq("owner_id", userId);
      const own = sortWorkspaces((data ?? []) as Workspace[], userId);
      setWorkspaces(own);
      if (own.length > 0) setExistingId(own[0].id);
    })();
  }, [router]);

  const existing = workspaces.find((w) => w.id === existingId);
  const unit = mode === "new" ? currencyUnit : existing?.currency_unit;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessages([]);
    if (mode === "new" && !companyName.trim()) {
      setStatus("error");
      setMessages(["Company name is required for a new company."]);
      return;
    }
    if (mode === "existing" && !existing) {
      setStatus("error");
      setMessages(["Choose one of your companies, or switch to New company."]);
      return;
    }
    // Same checks the server runs; the server runs them again regardless of what happens here.
    const prepared = prepareFromForm(
      { periodType, periodLabel: periodLabel.trim(), periodEndDate, basis, values, sourceFile: sourceFile.trim() || "manual-entry", extractionNotes: null },
      []
    );
    setIssues([...prepared.issues]);
    const statement = prepared.row;
    if (!statement) {
      setStatus("error");
      setMessages(prepared.errors);
      return;
    }

    setStatus("submitting");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setStatus("error");
      setMessages(["Not logged in — please log in to Sentinel in this browser first, then retry."]);
      return;
    }
    const payload =
      mode === "new"
        ? { company_name: companyName.trim(), sector, industry: industry.trim() || null, comparison_basis: comparisonBasis, currency_unit: currencyUnit, statement }
        : { workspace_id: existingId, statement };
    try {
      const res = await fetch("/api/sentinel/statement", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessages(json.details?.length ? json.details : [json.error ?? "Something went wrong."]);
        return;
      }
      setStatus("done");
      setMessages([`Saved (${json.status}).`, ...(json.warnings ?? [])]);
      if (mode === "new") {
        // The new company now exists: switch to adding periods to it.
        const { data } = await supabase.from("sentinel_workspaces").select("*").eq("id", json.workspace_id).maybeSingle();
        if (data) {
          setWorkspaces((prev) => [...prev, data as Workspace]);
          setExistingId(json.workspace_id);
          setMode("existing");
        }
      }
    } catch (err) {
      setStatus("error");
      setMessages([err instanceof Error ? err.message : "Request failed."]);
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0 }}>Data Entry</h1>
      <p style={{ fontSize: "0.85rem", color: T.inkSoft, margin: "0.4rem 0 1.2rem 0" }}>
        Saves through the server, which checks ownership and the accounting before anything is written. Create a new company, or add a period to one you own.
      </p>

      <div role="radiogroup" aria-label="What to add" style={{ marginBottom: "1rem", display: "flex", gap: "1.2rem" }}>
        <label>
          <input type="radio" name="mode" checked={mode === "new"} onChange={() => setMode("new")} /> New company
        </label>
        <label>
          <input type="radio" name="mode" checked={mode === "existing"} onChange={() => setMode("existing")} disabled={workspaces.length === 0} /> Add period to a company
        </label>
      </div>

      <form onSubmit={handleSubmit} style={{ background: T.card, border: `1px solid ${T.rule}`, borderRadius: 3, padding: "1.6rem 1.8rem" }}>
        {mode === "new" ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.2rem" }}>
            <Field label="Company name *" htmlFor="de-name" span2>
              <input id="de-name" style={inputStyle} value={companyName} onChange={(e) => setCompanyName(e.target.value)} maxLength={120} />
            </Field>
            <Field label="Sector" htmlFor="de-sector">
              <select id="de-sector" style={inputStyle} value={sector} onChange={(e) => setSector(e.target.value)}>
                {Object.entries(SECTOR_CONFIGS).map(([k, c]) => (
                  <option key={k} value={k}>{c.display_name}</option>
                ))}
              </select>
            </Field>
            <Field label="Industry (optional)" htmlFor="de-industry">
              <input id="de-industry" style={inputStyle} value={industry} onChange={(e) => setIndustry(e.target.value)} maxLength={80} />
            </Field>
            <Field label="Reporting unit" htmlFor="de-unit">
              <select id="de-unit" style={inputStyle} value={currencyUnit} onChange={(e) => setCurrencyUnit(e.target.value)}>
                {UNIT_OPTIONS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Compared on" htmlFor="de-cbasis">
              <select id="de-cbasis" style={inputStyle} value={comparisonBasis} onChange={(e) => { setComparisonBasis(e.target.value as Basis); setBasis(e.target.value as Basis); }}>
                {BASES.map((b) => (
                  <option key={b} value={b}>{b === "standalone" ? "Standalone" : "Consolidated"}</option>
                ))}
              </select>
            </Field>
          </div>
        ) : (
          <div style={{ marginBottom: "1.2rem" }}>
            <Field label="Company" htmlFor="de-existing">
              <select id="de-existing" style={inputStyle} value={existingId} onChange={(e) => setExistingId(e.target.value)}>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>{w.company_name}</option>
                ))}
              </select>
            </Field>
            {existing && (
              <p style={{ fontSize: "0.75rem", color: T.inkSoft, margin: "0.4rem 0 0 0" }}>
                Entered in {unitLabel(existing.currency_unit)}; compared on a {existing.comparison_basis} basis.
              </p>
            )}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.2rem" }}>
          <Field label="Period type" htmlFor="de-ptype">
            <select id="de-ptype" style={inputStyle} value={periodType} onChange={(e) => setPeriodType(e.target.value)}>
              {PERIOD_TYPES.map((p) => (
                <option key={p} value={p}>{p === "FY" ? "Full Year" : p}</option>
              ))}
            </select>
          </Field>
          <Field label="Period label * (e.g. FY25)" htmlFor="de-plabel">
            <input id="de-plabel" style={inputStyle} value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} maxLength={40} />
          </Field>
          <Field label="Period end date *" htmlFor="de-pend">
            <input id="de-pend" type="date" style={inputStyle} value={periodEndDate} onChange={(e) => setPeriodEndDate(e.target.value)} />
          </Field>
          <Field label="Basis of these figures" htmlFor="de-pbasis">
            <select id="de-pbasis" style={inputStyle} value={basis} onChange={(e) => setBasis(e.target.value as Basis)}>
              {BASES.map((b) => (
                <option key={b} value={b}>{b === "standalone" ? "Standalone" : "Consolidated"}</option>
              ))}
            </select>
          </Field>
        </div>

        <StatementFields
          values={values}
          onChange={(key, v) => setValues((prev) => ({ ...prev, [key]: v }))}
          issues={issues}
          unitLabel={unitLabel(unit)}
          disabled={status === "submitting"}
        />

        <Field label="Source (optional, e.g. britannia-fy25-annual-report)" htmlFor="de-source">
          <input id="de-source" style={inputStyle} value={sourceFile} onChange={(e) => setSourceFile(e.target.value)} maxLength={200} />
        </Field>

        <button type="submit" disabled={status === "submitting"} style={{ ...btnPrimary, marginTop: "1.4rem" }}>
          {status === "submitting" ? "Saving..." : "Save period"}
        </button>

        {messages.length > 0 && (
          <div role={status === "error" ? "alert" : "status"} style={{ marginTop: "1rem", fontSize: "0.85rem", color: status === "error" ? "#B3261E" : "#2F5233" }}>
            {messages.map((m, i) => (
              <p key={i} style={{ margin: "0.2rem 0" }}>{m}</p>
            ))}
          </div>
        )}
      </form>
    </div>
  );
}
