"use client";
export const dynamic = "force-dynamic";

// Sentinel - Import files. One or several files (text PDFs, CSV, Excel), every period each one holds, previewed
// before anything is saved. Reading is done by rules on the server - no AI - and the same checks a typed period gets
// are applied to every row. Periods already on file are shown as "replace" and are not ticked until you tick them.
//
// Saving goes through /api/sentinel/statement one period at a time, so the server enforces ownership and
// validation again; each row reports its own outcome and one failure does not undo the others.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";
import { planImport, summariseImport, type ExistingPeriod, type ImportFile, type ImportRow } from "../../../lib/autofill/plan";
import type { AutofillResult } from "../../../lib/autofill/types";
import { useShell } from "../../../lib/shell/ShellData";
import { SERIF, T } from "../../../lib/theme";
import { sendFile, UploadError } from "../../../lib/uploadClient";
import { UNIT_OPTIONS, normaliseUnit, unitLabel, type CurrencyUnit } from "../../../lib/units";

const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.rule}`, borderRadius: 3, padding: "1.2rem 1.4rem", marginBottom: "1.2rem" };
const btn: React.CSSProperties = { fontFamily: "inherit", fontSize: "0.86rem", fontWeight: 500, padding: "0.55rem 1.2rem", border: `1px solid ${T.accent}`, borderRadius: 3, background: T.accent, color: T.background, cursor: "pointer" };
const btnGhost: React.CSSProperties = { ...btn, background: "transparent", color: T.ink };
const small: React.CSSProperties = { fontSize: "0.78rem", color: T.inkSoft, margin: "0.4rem 0 0 0", lineHeight: 1.5 };
const selectStyle: React.CSSProperties = { fontFamily: "inherit", fontSize: "0.8rem", padding: "0.3rem 0.5rem", border: `1px solid ${T.rule}`, borderRadius: 3, background: T.card, color: T.ink };

type Outcome = { ok: boolean; message: string };
const STATUS_LABEL: Record<ImportRow["status"], string> = { new: "New", replace: "Replaces", blocked: "Cannot import", duplicate: "Skipped" };

export default function ImportPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const { workspaces, userId, loading: shellLoading, signedIn } = useShell();
  const workspace = workspaces.find((w) => w.id === id) ?? null;
  const canWrite = !!workspace && workspace.owner_id === userId;

  const [files, setFiles] = useState<ImportFile[]>([]);
  const [existing, setExisting] = useState<ExistingPeriod[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reading, setReading] = useState(false);
  const [readingFile, setReadingFile] = useState<string | null>(null);
  const [readingSeconds, setReadingSeconds] = useState(0);
  const readAbort = useRef<AbortController | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (shellLoading) return;
    if (!signedIn) router.push("/login");
  }, [shellLoading, signedIn, router]);

  async function loadExisting() {
    const { data } = await supabase.from("sentinel_statements").select("id,period_type,period_label,period_end_date,basis,revenue_from_operations").eq("workspace_id", id);
    setExisting((data ?? []) as ExistingPeriod[]);
  }
  useEffect(() => {
    if (workspace) loadExisting();
  }, [workspace?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => (workspace ? planImport(files, workspace, existing) : []), [files, workspace, existing]);

  // Tick the rows that are safe to import by default, once each - a person's own ticking is never reset by a re-plan.
  useEffect(() => {
    const fresh = rows.filter((r) => !seen.current.has(`${r.id}:${r.status}`));
    if (fresh.length === 0) return;
    fresh.forEach((r) => seen.current.add(`${r.id}:${r.status}`));
    setSelected((prev) => {
      const next = new Set([...prev].filter((rid) => rows.some((r) => r.id === rid && r.statement)));
      fresh.forEach((r) => {
        if (r.selectedByDefault) next.add(r.id);
        else if (!r.statement) next.delete(r.id);
      });
      return next;
    });
  }, [rows]);

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
  if (!canWrite) {
    return (
      <div style={{ maxWidth: 560 }}>
        <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0 }}>Import files</h1>
        <p style={{ fontSize: "0.9rem", color: T.inkSoft, margin: "0.8rem 0 1.2rem 0", lineHeight: 1.6 }}>
          {workspace.company_name} is a reference company, so it is read-only. Create your own project to import into.
        </p>
        <Link href="/sentinel/new-project" style={{ ...btn, textDecoration: "none", display: "inline-block" }}>New project</Link>
      </div>
    );
  }

  async function readFiles(list: FileList | null) {
    if (!list || list.length === 0 || !workspace) return;
    setErrors([]);
    setOutcomes({});
    setReading(true);
    setReadingSeconds(0);
    const started = Date.now();
    const ticker = setInterval(() => setReadingSeconds(Math.round((Date.now() - started) / 1000)), 1000);
    const ctrl = new AbortController();
    readAbort.current = ctrl;
    const added: ImportFile[] = [];
    const problems: string[] = [];
    try {
      for (const f of Array.from(list)) {
        if (files.some((x) => x.name === f.name) || added.some((x) => x.name === f.name)) {
          problems.push(`${f.name} is already in the list.`);
          continue;
        }
        setReadingFile(f.name);
        try {
          const result = await sendFile<AutofillResult>(
            "/api/sentinel/autofill",
            f,
            { basis: workspace.comparison_basis, fy_start_month: String(workspace.fiscal_year_start_month) },
            { signal: ctrl.signal }
          );
          added.push({ name: f.name, result, unit: result.unit.unit });
        } catch (e) {
          if (e instanceof UploadError && e.unauthenticated) {
            router.push("/login");
            return;
          }
          if (ctrl.signal.aborted && !(e instanceof UploadError && e.timedOut)) {
            problems.push("Stopped - the rest of this file list was not read.");
            break;
          }
          problems.push(`${f.name}: ${e instanceof Error ? e.message : "could not be read."}`);
        }
      }
    } finally {
      clearInterval(ticker);
      readAbort.current = null;
      setReadingFile(null);
      setReading(false);
    }
    setFiles((prev) => [...prev, ...added]);
    setErrors(problems);
  }

  function cancelReading() {
    readAbort.current?.abort();
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.name !== name));
    seen.current.clear();
    setSelected(new Set());
    setOutcomes({});
  }

  function setFileUnit(name: string, unit: CurrencyUnit | "") {
    setFiles((prev) => prev.map((f) => (f.name === name ? { ...f, unit: unit || null } : f)));
    seen.current.clear();
    setSelected(new Set());
  }

  async function runImport() {
    const chosen = rows.filter((r) => selected.has(r.id) && r.statement);
    if (chosen.length === 0) return;
    setSaving(true);
    setErrors([]);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      router.push("/login");
      return;
    }
    const results: Record<string, Outcome> = {};
    for (const r of chosen) {
      try {
        const res = await fetch("/api/sentinel/statement", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ workspace_id: id, statement: r.statement, sources: r.sources }),
        });
        const body = (await res.json().catch(() => ({}))) as { status?: string; error?: string; details?: string[]; warnings?: string[] };
        results[r.id] = res.ok
          ? { ok: true, message: body.status === "updated" ? "Replaced." : "Added." }
          : { ok: false, message: [body.error, ...(body.details ?? [])].filter(Boolean).join(" ") || `Failed (${res.status}).` };
      } catch {
        results[r.id] = { ok: false, message: "The request failed. Check your connection." };
      }
      setOutcomes({ ...results });
    }
    await loadExisting();
    setSaving(false);
  }

  const chosenCount = rows.filter((r) => selected.has(r.id) && r.statement).length;
  const saved = Object.values(outcomes).filter((o) => o.ok).length;
  const failed = Object.values(outcomes).filter((o) => !o.ok).length;
  const attempted = saved + failed > 0;

  return (
    <div style={{ maxWidth: 940 }}>
      <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0 }}>Import files</h1>
      <p style={{ fontSize: "0.86rem", color: T.inkSoft, margin: "0.5rem 0 1.4rem 0", lineHeight: 1.55 }}>
        Add one or more text PDFs, CSVs or Excel files for <strong>{workspace.company_name}</strong>. Every period a file holds is read by rules (no AI) and listed
        below with the checks it passed. Nothing is saved until you press Import. Figures are read in {unitLabel(workspace.currency_unit)}; a file in another
        unit is converted.
      </p>

      {errors.length > 0 && (
        <div role="alert" style={{ fontSize: "0.85rem", background: T.accentSoft, borderLeft: `2px solid ${T.accent}`, padding: "0.6rem 0.9rem", marginBottom: "1.2rem" }}>
          {errors.map((e, i) => <p key={i} style={{ margin: i === 0 ? 0 : "0.3rem 0 0 0" }}>{e}</p>)}
        </div>
      )}

      <section style={card} aria-label="Files">
        <label htmlFor="sentinel-import-files" style={{ fontSize: "0.82rem", fontWeight: 600, display: "block", marginBottom: "0.5rem" }}>Choose files</label>
        <input
          id="sentinel-import-files"
          type="file"
          multiple
          accept=".pdf,.csv,.tsv,.txt,.xlsx,.xlsm,application/pdf,text/csv"
          disabled={reading || saving}
          onChange={(e) => {
            readFiles(e.target.files);
            e.target.value = "";
          }}
          style={{ fontSize: "0.85rem" }}
        />
        {reading && (
          <div role="status" style={{ marginTop: "0.5rem" }}>
            <p style={{ ...small, color: T.accent, margin: 0 }}>
              {readingFile ? `Reading ${readingFile}\u2026` : "Reading\u2026"} ({readingSeconds}s)
            </p>
            {readingSeconds >= 20 && readingSeconds < 90 && (
              <p style={{ ...small, margin: "0.2rem 0 0 0" }}>A full annual report can run to hundreds of pages - this can take a minute or two.</p>
            )}
            {readingSeconds >= 90 && (
              <p style={{ ...small, margin: "0.2rem 0 0 0" }}>
                Still working. If this passes five minutes it will stop on its own; you can also{" "}
                <button type="button" onClick={cancelReading} style={{ ...small, color: T.accent, background: "none", border: "none", padding: 0, textDecoration: "underline", cursor: "pointer", font: "inherit" }}>
                  cancel
                </button>{" "}
                and try a smaller file.
              </p>
            )}
          </div>
        )}
        {files.length > 0 && (
          <ul style={{ listStyle: "none", margin: "1rem 0 0 0", padding: 0 }} aria-label="Files read">
            {files.map((f) => (
              <li key={f.name} style={{ display: "flex", gap: "0.8rem", alignItems: "center", flexWrap: "wrap", padding: "0.5rem 0", borderTop: `1px solid ${T.rule}`, fontSize: "0.84rem" }}>
                <span style={{ fontWeight: 600 }}>{f.name}</span>
                <span style={{ color: T.inkSoft }}>{f.result.kind.toUpperCase()}, {f.result.periods.length} period{f.result.periods.length === 1 ? "" : "s"}</span>
                <label style={{ color: T.inkSoft, fontSize: "0.78rem" }}>
                  Unit{" "}
                  <select
                    aria-label={`Unit used in ${f.name}`}
                    style={selectStyle}
                    value={f.unit ?? ""}
                    onChange={(e) => setFileUnit(f.name, e.target.value as CurrencyUnit | "")}
                    disabled={saving}
                  >
                    <option value="">Not stated - enter as printed</option>
                    {UNIT_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                </label>
                <span style={{ color: T.inkSoft, fontSize: "0.76rem" }}>
                  {f.result.unit.unit ? `read from the file${f.result.unit.ambiguous ? " (more than one unit mentioned; check it)" : ""}` : "the file does not say"}
                  {f.unit && normaliseUnit(workspace.currency_unit) !== f.unit ? `; converted to ${unitLabel(workspace.currency_unit)}` : ""}
                </span>
                <button type="button" onClick={() => removeFile(f.name)} disabled={saving} style={{ ...selectStyle, marginLeft: "auto", cursor: "pointer" }} aria-label={`Remove ${f.name}`}>Remove</button>
                {f.result.notes.length > 0 && (
                  <div style={{ flexBasis: "100%", fontSize: "0.76rem", color: T.inkSoft, lineHeight: 1.5 }}>
                    {f.result.notes.map((n, i) => <div key={i}>{n}</div>)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {rows.length > 0 && (
        <section aria-label="Periods found" style={{ ...card, padding: 0, overflowX: "auto" }}>
          <div style={{ padding: "1rem 1.4rem", borderBottom: `1px solid ${T.rule}` }}>
            <p style={{ margin: 0, fontSize: "0.86rem", fontWeight: 600 }} role="status" data-testid="import-summary">{summariseImport(rows, selected)}</p>
            <p style={small}>Tick the periods to import. Anything marked &quot;worked out&quot; or &quot;low confidence&quot; is noted on the saved period; open it in Edit periods to check it.</p>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" }}>
            <caption style={{ position: "absolute", left: -9999 }}>Periods found in the files</caption>
            <thead>
              <tr style={{ textAlign: "left", color: T.inkSoft, fontSize: "0.7rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                <th scope="col" style={{ padding: "0.6rem 1rem" }}><span style={{ position: "absolute", left: -9999 }}>Import</span></th>
                <th scope="col" style={{ padding: "0.6rem 0.6rem", fontWeight: 600 }}>Period</th>
                <th scope="col" style={{ padding: "0.6rem 0.6rem", fontWeight: 600 }}>Basis</th>
                <th scope="col" style={{ padding: "0.6rem 0.6rem", fontWeight: 600 }}>Ends</th>
                <th scope="col" style={{ padding: "0.6rem 0.6rem", fontWeight: 600, textAlign: "right" }}>Figures</th>
                <th scope="col" style={{ padding: "0.6rem 0.6rem", fontWeight: 600 }}>What happens</th>
                <th scope="col" style={{ padding: "0.6rem 1rem", fontWeight: 600 }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const o = outcomes[r.id];
                const name = `${r.period_label ?? "Unidentified period"} ${r.basis} from ${r.file}`;
                return (
                  <tr key={r.id} style={{ borderTop: `1px solid ${T.rule}`, verticalAlign: "top", opacity: r.statement ? 1 : 0.8 }}>
                    <td style={{ padding: "0.6rem 1rem" }}>
                      <input
                        type="checkbox"
                        aria-label={`Import ${name}`}
                        checked={selected.has(r.id)}
                        disabled={!r.statement || saving}
                        onChange={(e) => setSelected((prev) => { const n = new Set(prev); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })}
                      />
                    </td>
                    <th scope="row" style={{ padding: "0.6rem 0.6rem", textAlign: "left", fontWeight: 600 }}>
                      {r.period_label ?? "Not identified"} <span style={{ color: T.inkSoft, fontWeight: 400, fontSize: "0.74rem" }}>{r.period_type ?? ""}</span>
                      <div style={{ color: T.inkSoft, fontWeight: 400, fontSize: "0.72rem" }}>{r.file}</div>
                    </th>
                    <td style={{ padding: "0.6rem 0.6rem", color: T.inkSoft }}>{r.basis}</td>
                    <td style={{ padding: "0.6rem 0.6rem", color: T.inkSoft, fontVariantNumeric: "tabular-nums" }}>{r.period_end_date ?? "—"}</td>
                    <td style={{ padding: "0.6rem 0.6rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.figures}</td>
                    <td style={{ padding: "0.6rem 0.6rem", fontWeight: 600, color: r.status === "blocked" ? T.accent : T.ink }}>
                      {o ? (o.ok ? o.message : "Failed") : STATUS_LABEL[r.status]}
                    </td>
                    <td style={{ padding: "0.6rem 1rem", color: T.inkSoft, fontSize: "0.78rem", lineHeight: 1.5 }}>
                      {o && !o.ok && <div style={{ color: T.ink }}>{o.message}</div>}
                      {r.errors.map((e, i) => <div key={`e${i}`} style={{ color: T.ink }}>{e}</div>)}
                      {r.warnings.map((w, i) => <div key={`w${i}`}>{w}</div>)}
                      {r.toVerify > 0 && <div>{r.toVerify} figure{r.toVerify === 1 ? " is" : "s are"} worked out or low confidence.</div>}
                      {r.periodNotes.map((n, i) => <div key={`n${i}`}>{n}</div>)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: "1rem 1.4rem", borderTop: `1px solid ${T.rule}`, display: "flex", gap: "0.8rem", alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" style={btn} onClick={runImport} disabled={saving || chosenCount === 0}>
              {saving ? "Importing..." : `Import ${chosenCount} period${chosenCount === 1 ? "" : "s"}`}
            </button>
            {attempted && !saving && (
              <span role="status" style={{ fontSize: "0.84rem" }}>
                {saved} saved{failed > 0 ? `, ${failed} failed (see the notes)` : ""}.{" "}
                <Link href={`/sentinel/projects/${id}`} style={{ color: T.accent }}>Open the project</Link>
              </span>
            )}
          </div>
        </section>
      )}

      {files.length === 0 && !reading && (
        <p style={{ fontSize: "0.84rem", color: T.inkSoft, lineHeight: 1.6 }}>
          Scanned or image-only PDFs have no text to read; use the filing&apos;s text version, or type the figures on{" "}
          <Link href={`/sentinel/data-entry?workspace=${id}`} style={{ color: T.accent }}>Add period</Link>.
        </p>
      )}
    </div>
  );
}
