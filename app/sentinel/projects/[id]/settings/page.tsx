"use client";
export const dynamic = "force-dynamic";

// Sentinel - Project settings. The things that describe a project (name, sector, year-end, comparison basis),
// the unit it reports in, and deleting it. A reference company shows the same details read-only.
//
// The reporting unit is a deliberate two-way choice, because the two cases look identical on screen and are
// opposite in effect: "relabel" keeps the stored numbers and changes what they are called (they were typed in lakh
// under a crore label); "convert" keeps the figures true and changes the numbers (crore to lakh multiplies them
// by 100). The page shows the latest revenue before and after, for whichever is chosen, before anything is sent.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";
import { SECTOR_CONFIGS } from "../../../lib/config";
import { BASES } from "../../../lib/fields";
import { Field, inputStyle } from "../../../lib/StatementFields";
import { useShell } from "../../../lib/shell/ShellData";
import { SERIF, T } from "../../../lib/theme";
import { latestAnnual } from "../../../lib/shell/summary";
import { planUnitChange, type UnitChangeMode, type UnitChangePlan } from "../../../lib/unitChange";
import { UNIT_OPTIONS, formatMoney, normaliseUnit, unitLabel } from "../../../lib/units";
import type { Basis, FinancialStatement } from "../../../lib/types";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.rule}`, borderRadius: 3, padding: "1.4rem 1.6rem", marginBottom: "1.4rem", maxWidth: 720 };
const btn: React.CSSProperties = { fontFamily: "inherit", fontSize: "0.86rem", fontWeight: 500, padding: "0.55rem 1.2rem", border: `1px solid ${T.ink}`, borderRadius: 3, background: T.ink, color: T.background, cursor: "pointer" };
const btnGhost: React.CSSProperties = { ...btn, background: "transparent", color: T.ink };
const h2: React.CSSProperties = { fontFamily: SERIF, fontWeight: 500, fontSize: "1.2rem", margin: "0 0 0.3rem 0" };
const lead: React.CSSProperties = { fontSize: "0.82rem", color: T.inkSoft, margin: "0 0 1.1rem 0", lineHeight: 1.55 };

type Preview = { error: string } | { plan: Extract<UnitChangePlan, { ok: true }>; line: string | null };

export default function ProjectSettingsPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const { workspaces, userId, loading: shellLoading, signedIn, reload } = useShell();
  const workspace = workspaces.find((w) => w.id === id) ?? null;
  const canWrite = !!workspace && workspace.owner_id === userId;

  const [statements, setStatements] = useState<FinancialStatement[]>([]);
  const [name, setName] = useState("");
  const [sector, setSector] = useState("general");
  const [industry, setIndustry] = useState("");
  const [fyStart, setFyStart] = useState(4);
  const [basis, setBasis] = useState<Basis>("consolidated");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newUnit, setNewUnit] = useState("");
  const [mode, setMode] = useState<UnitChangeMode>("convert");
  const [changingUnit, setChangingUnit] = useState(false);
  const [unitMessage, setUnitMessage] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (shellLoading) return;
    if (!signedIn) router.push("/login");
  }, [shellLoading, signedIn, router]);

  // Start the form from what is stored, again whenever the stored project changes (after a save or a unit change).
  useEffect(() => {
    if (!workspace) return;
    setName(workspace.company_name);
    setSector(workspace.sector);
    setIndustry(workspace.industry ?? "");
    setFyStart(workspace.fiscal_year_start_month);
    setBasis(workspace.comparison_basis);
    setNewUnit((u) => u || (normaliseUnit(workspace.currency_unit) === "INR_LAKH" ? "INR_CRORE" : "INR_LAKH"));
  }, [workspace]);

  useEffect(() => {
    if (!workspace) return;
    let cancelled = false;
    supabase
      .from("sentinel_statements")
      .select("*")
      .eq("workspace_id", id)
      .then(({ data }: { data: unknown }) => {
        if (!cancelled) setStatements((data ?? []) as FinancialStatement[]);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace?.id, workspace?.currency_unit, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const preview = useMemo<Preview | null>(() => {
    if (!workspace) return null;
    const plan = planUnitChange(statements, workspace.currency_unit, newUnit, mode);
    if (!plan.ok) return { error: plan.error };
    const latest = latestAnnual(workspace, statements);
    if (!latest) return { plan, line: null };
    const before = latest.revenue_from_operations;
    const after = mode === "relabel" ? before : plan.rows.find((r) => r.id === latest.id)?.revenue_from_operations ?? before;
    return { plan, line: `${latest.period_label} revenue: ${formatMoney(before, workspace.currency_unit)} becomes ${formatMoney(after, plan.to)}` };
  }, [workspace, statements, newUnit, mode]);

  if (shellLoading) return <p style={{ color: T.inkSoft }}>Loading project...</p>;
  if (!workspace) {
    return (
      <div style={{ maxWidth: 560 }}>
        <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0 }}>Project not found</h1>
        <p style={{ fontSize: "0.9rem", color: T.inkSoft, margin: "0.8rem 0 1.2rem 0" }}>This project does not exist, or it belongs to someone else.</p>
        <Link href="/sentinel/projects" style={{ ...btn, textDecoration: "none", display: "inline-block" }}>All projects</Link>
      </div>
    );
  }

  async function saveGeneral(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("A project needs a name.");
      return;
    }
    setSaving(true);
    const { error: updateError } = await supabase
      .from("sentinel_workspaces")
      .update({ company_name: trimmed, sector, industry: industry.trim() || null, fiscal_year_start_month: fyStart, comparison_basis: basis })
      .eq("id", id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await reload();
    setSaved(true);
  }

  async function changeUnit() {
    setError(null);
    setUnitMessage(null);
    setChangingUnit(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        router.push("/login");
        return;
      }
      const res = await fetch("/api/sentinel/workspace/unit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspace_id: id, unit: newUnit, mode }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((body as { error?: string }).error ?? "The unit could not be changed.");
        return;
      }
      await reload();
      const b = body as { statements_changed: number; lossy: boolean; investigations_to_regenerate: number; to: string };
      setUnitMessage(
        [
          mode === "relabel"
            ? `The project now reports in ${unitLabel(b.to)}. The stored figures were not changed.`
            : `The project now reports in ${unitLabel(b.to)}; ${b.statements_changed} period${b.statements_changed === 1 ? "" : "s"} converted.`,
          b.lossy ? "Some figures have more digits than the new unit can hold and were rounded." : "",
          b.investigations_to_regenerate > 0
            ? `${b.investigations_to_regenerate} existing investigation${b.investigations_to_regenerate === 1 ? "" : "s"} quote amounts in the old unit; generate ${b.investigations_to_regenerate === 1 ? "it" : "them"} again.`
            : "",
        ].filter(Boolean).join(" ")
      );
    } catch {
      setError("The unit could not be changed. Check your connection and try again.");
    } finally {
      setChangingUnit(false);
    }
  }

  async function deleteProject() {
    if (!workspace) return;
    if (deleteText.trim() !== workspace.company_name) {
      setError("Type the project name exactly to confirm deletion.");
      return;
    }
    setDeleting(true);
    setError(null);
    // Children before parents, stopping at the first failure so a half-deleted project is never left behind
    // without the page saying which step stopped.
    const steps: [string, string][] = [
      ["recommendations", "sentinel_recommendations"],
      ["investigations", "sentinel_investigations"],
      ["periods", "sentinel_statements"],
      ["review cycles", "sentinel_review_cycles"],
    ];
    for (const [label, table] of steps) {
      const { error: stepError } = await supabase.from(table).delete().eq("workspace_id", workspace.id);
      if (stepError) {
        setDeleting(false);
        setError(`Could not delete the project's ${label}: ${stepError.message}. Nothing after this step was deleted; try again.`);
        return;
      }
    }
    const { error: wsError } = await supabase.from("sentinel_workspaces").delete().eq("id", workspace.id);
    if (wsError) {
      setDeleting(false);
      setError(`The project's data was deleted but the project itself could not be: ${wsError.message}`);
      return;
    }
    await reload();
    router.push("/sentinel/projects");
  }

  const readOnly = !canWrite;

  return (
    <div>
      <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0 }}>Settings</h1>
      <p style={{ fontSize: "0.8rem", color: T.inkSoft, margin: "0.4rem 0 1.6rem 0" }}>{workspace.company_name}</p>

      {error && (
        <p role="alert" style={{ fontSize: "0.85rem", background: T.accentSoft, borderLeft: `2px solid ${T.accent}`, padding: "0.6rem 0.9rem", marginBottom: "1.2rem", maxWidth: 720 }}>
          {error}
        </p>
      )}
      {readOnly && (
        <p style={{ fontSize: "0.85rem", color: T.inkSoft, marginBottom: "1.2rem", maxWidth: 720 }}>
          This is a reference company, so its settings are read-only. Create your own project to change settings.
        </p>
      )}

      <form onSubmit={saveGeneral} style={card} aria-label="General">
        <h2 style={h2}>General</h2>
        <p style={lead}>What this project is called and how its years and comparisons work.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.2rem" }}>
          <Field label="Project name" htmlFor="ps-name" span2>
            <input id="ps-name" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} disabled={readOnly || saving} />
          </Field>
          <Field label="Sector" htmlFor="ps-sector">
            <select id="ps-sector" style={inputStyle} value={sector} onChange={(e) => setSector(e.target.value)} disabled={readOnly || saving}>
              {Object.entries(SECTOR_CONFIGS).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.display_name}</option>
              ))}
            </select>
          </Field>
          <Field label="Industry (optional)" htmlFor="ps-industry">
            <input id="ps-industry" style={inputStyle} value={industry} onChange={(e) => setIndustry(e.target.value)} maxLength={80} disabled={readOnly || saving} />
          </Field>
          <Field label="Fiscal year starts" htmlFor="ps-fy">
            <select id="ps-fy" style={inputStyle} value={fyStart} onChange={(e) => setFyStart(Number(e.target.value))} disabled={readOnly || saving}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="Compared on" htmlFor="ps-basis">
            <select id="ps-basis" style={inputStyle} value={basis} onChange={(e) => setBasis(e.target.value as Basis)} disabled={readOnly || saving}>
              {BASES.map((b) => (
                <option key={b} value={b}>{b === "standalone" ? "Standalone" : "Consolidated"}</option>
              ))}
            </select>
          </Field>
        </div>
        {sector !== workspace.sector && (
          <p style={{ ...lead, margin: "0 0 1rem 0" }}>Changing the sector changes the thresholds and ratios used for this project&apos;s flags and health checks.</p>
        )}
        {!readOnly && (
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <button type="submit" style={btn} disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>
            {saved && <span role="status" style={{ fontSize: "0.82rem", color: T.inkSoft }}>Saved.</span>}
          </div>
        )}
      </form>

      <section style={card} aria-label="Reporting unit">
        <h2 style={h2}>Reporting unit</h2>
        <p style={lead}>
          This project reports in <strong>{unitLabel(workspace.currency_unit)}</strong>. Figures you enter are read in this unit, and files in another unit are
          converted to it. To look at everything in another unit without changing anything stored, use the Display switch at the top of the page.
        </p>
        {readOnly ? null : (
          <>
            <Field label="Change to" htmlFor="ps-unit">
              <select id="ps-unit" style={{ ...inputStyle, maxWidth: 260 }} value={newUnit} onChange={(e) => setNewUnit(e.target.value)} disabled={changingUnit}>
                {UNIT_OPTIONS.filter((u) => u.value !== normaliseUnit(workspace.currency_unit)).map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </Field>
            <fieldset style={{ border: "none", padding: 0, margin: "1rem 0 0.6rem 0" }} disabled={changingUnit}>
              <legend style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: "0.4rem" }}>What do you want to happen to the figures?</legend>
              <label style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", fontSize: "0.85rem", marginBottom: "0.5rem", lineHeight: 1.5 }}>
                <input type="radio" name="unit-mode" checked={mode === "convert"} onChange={() => setMode("convert")} style={{ marginTop: 4 }} />
                <span>
                  <strong>Convert them.</strong> The figures are correct in the current unit; show them in the new one (crore to lakh multiplies every amount by 100).
                </span>
              </label>
              <label style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", fontSize: "0.85rem", lineHeight: 1.5 }}>
                <input type="radio" name="unit-mode" checked={mode === "relabel"} onChange={() => setMode("relabel")} style={{ marginTop: 4 }} />
                <span>
                  <strong>Only fix the label.</strong> The numbers are right but the unit is wrong (typed in lakh, labelled crore). Nothing stored changes.
                </span>
              </label>
            </fieldset>
            {preview && "error" in preview && <p style={{ ...lead, margin: "0 0 0.8rem 0" }}>{preview.error}</p>}
            {preview && "plan" in preview && (
              <p style={{ fontSize: "0.82rem", margin: "0 0 1rem 0", lineHeight: 1.55 }} aria-live="polite" data-testid="unit-preview">
                {preview.line ?? "There are no periods yet, so only the unit changes."}{" "}
                {mode === "convert" && preview.plan.statementsChanged > 0 && <span style={{ color: T.inkSoft }}>{preview.plan.statementsChanged} period{preview.plan.statementsChanged === 1 ? "" : "s"} will be rewritten.</span>}
              </p>
            )}
            <button type="button" style={btn} onClick={changeUnit} disabled={changingUnit || !preview || "error" in preview}>
              {changingUnit ? "Changing..." : mode === "convert" ? "Convert to this unit" : "Change the label"}
            </button>
            {unitMessage && <p role="status" style={{ fontSize: "0.82rem", margin: "0.9rem 0 0 0", lineHeight: 1.55 }}>{unitMessage}</p>}
          </>
        )}
      </section>

      {!readOnly && (
        <section style={{ ...card, borderColor: T.accent }} aria-label="Delete project">
          <h2 style={h2}>Delete this project</h2>
          <p style={lead}>
            Permanently deletes <strong>{workspace.company_name}</strong> and every period, review cycle, investigation and recommendation under it. This cannot be undone.
          </p>
          {!confirmDelete ? (
            <button type="button" style={btnGhost} onClick={() => setConfirmDelete(true)}>Delete project...</button>
          ) : (
            <div>
              <label htmlFor="ps-delete" style={{ fontSize: "0.82rem", display: "block", marginBottom: "0.4rem" }}>Type the project name to confirm</label>
              <input id="ps-delete" style={{ ...inputStyle, marginBottom: "0.8rem" }} value={deleteText} onChange={(e) => setDeleteText(e.target.value)} placeholder={workspace.company_name} disabled={deleting} />
              <div style={{ display: "flex", gap: "0.6rem" }}>
                <button type="button" style={btn} onClick={deleteProject} disabled={deleting}>{deleting ? "Deleting..." : "Permanently delete"}</button>
                <button type="button" style={btnGhost} onClick={() => { setConfirmDelete(false); setDeleteText(""); }} disabled={deleting}>Cancel</button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
