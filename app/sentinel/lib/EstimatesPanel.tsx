"use client";

// Sentinel - the estimates panel on the Results brief: enter what was expected (revenue, EBITDA, PBT, PAT in rupees crore) by hand or from a CSV, and see
// what is stored. See lib/estimates.ts. Stored per person: nobody else sees these numbers.

import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { ESTIMATE_METRICS, METRIC_LABEL, parseEstimatesCsv, waitingForResults, type EstimateRow } from "./estimates";
import { T } from "./theme";

const input: React.CSSProperties = { fontFamily: "inherit", fontSize: "0.84rem", padding: "0.35rem 0.5rem", border: `1px solid ${T.rule}`, borderRadius: 3, background: T.card, color: T.ink, width: "100%", boxSizing: "border-box" };
const btn: React.CSSProperties = { fontFamily: "inherit", fontSize: "0.8rem", fontWeight: 500, padding: "0.4rem 0.9rem", border: `1px solid ${T.accent}`, borderRadius: 3, background: T.accent, color: T.background, cursor: "pointer" };
const ghost: React.CSSProperties = { ...btn, background: "transparent", color: T.ink, border: `1px solid ${T.rule}` };
const label: React.CSSProperties = { fontSize: "0.74rem", color: T.inkSoft, display: "block", marginBottom: 3 };

export function EstimatesPanel({ workspaceId, fyStartMonth, defaultPeriodEnd, estimates, setUp, reportedEnds, onChange }: {
  workspaceId: string; fyStartMonth: number; defaultPeriodEnd: string; estimates: (EstimateRow & { id?: string })[]; setUp: boolean; reportedEnds: Set<string>; onChange: () => void;
}) {
  const [period, setPeriod] = useState(defaultPeriodEnd);
  const [values, setValues] = useState<Record<string, string>>({});
  const [source, setSource] = useState<"consensus" | "own">("consensus");
  const [sourceLabel, setSourceLabel] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(rows: EstimateRow[]) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const res = await fetch("/api/sentinel/estimates", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ workspace_id: workspaceId, rows }) });
    const body = (await res.json().catch(() => ({}))) as { error?: string; saved?: number };
    if (!res.ok) { setMessage({ ok: false, text: body.error ?? "The estimates could not be saved." }); return false; }
    setMessage({ ok: true, text: `Saved ${body.saved} estimate${body.saved === 1 ? "" : "s"}.` });
    onChange();
    return true;
  }

  async function saveForm(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const rows: EstimateRow[] = [];
    for (const m of ESTIMATE_METRICS) {
      const raw = (values[m] ?? "").replace(/,/g, "").trim();
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) { setMessage({ ok: false, text: `${METRIC_LABEL[m]} is not a number.` }); return; }
      rows.push({ period_end_date: period, metric: m, source, source_label: sourceLabel.trim() || null, value_cr: n });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(period)) { setMessage({ ok: false, text: "Pick the date the quarter ends." }); return; }
    if (rows.length === 0) { setMessage({ ok: false, text: "Enter at least one figure." }); return; }
    setBusy(true);
    try { if (await post(rows)) setValues({}); } finally { setBusy(false); }
  }

  async function uploadCsv(file: File | null) {
    if (!file) return;
    setMessage(null);
    setBusy(true);
    try {
      const parsed = parseEstimatesCsv(await file.text(), fyStartMonth, source);
      if (parsed.rows.length === 0) { setMessage({ ok: false, text: parsed.errors[0] ?? "No estimates found in the file." }); return; }
      const ok = await post(parsed.rows);
      if (ok && parsed.errors.length > 0) setMessage({ ok: true, text: `Saved ${parsed.rows.length}. Skipped: ${parsed.errors.slice(0, 3).join(" ")}` });
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const res = await fetch(`/api/sentinel/estimates?id=${id}`, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (res.ok) onChange();
  }

  const waiting = waitingForResults(estimates, reportedEnds);
  return (
    <div data-testid="estimates-panel">
      {!setUp && <p style={{ fontSize: "0.82rem", color: T.inkSoft }}>Estimates are not set up on this database yet (run migration 20261108000000).</p>}
      {setUp && (
        <>
          <form onSubmit={saveForm}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.7rem", alignItems: "end" }}>
              <div><label style={label} htmlFor="est-period">Quarter ends</label><input id="est-period" type="date" style={input} value={period} onChange={(e) => setPeriod(e.target.value)} /></div>
              {ESTIMATE_METRICS.map((m) => (
                <div key={m}><label style={label} htmlFor={`est-${m}`}>{METRIC_LABEL[m]} (₹ cr)</label><input id={`est-${m}`} inputMode="decimal" style={input} value={values[m] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [m]: e.target.value }))} placeholder="e.g. 52,400" /></div>
              ))}
              <div><label style={label} htmlFor="est-source">Whose estimate</label>
                <select id="est-source" style={input} value={source} onChange={(e) => setSource(e.target.value as "consensus" | "own")}><option value="consensus">Consensus</option><option value="own">My estimate</option></select></div>
              <div><label style={label} htmlFor="est-label">Label (optional)</label><input id="est-label" style={input} value={sourceLabel} onChange={(e) => setSourceLabel(e.target.value)} placeholder="e.g. Bloomberg" maxLength={60} /></div>
            </div>
            <div style={{ display: "flex", gap: "0.8rem", alignItems: "center", marginTop: "0.8rem", flexWrap: "wrap" }}>
              <button type="submit" style={btn} disabled={busy} data-testid="save-estimates">Save estimates</button>
              <label style={{ ...ghost, display: "inline-block" }}>
                Upload a CSV
                <input type="file" accept=".csv,.txt" aria-label="Estimates CSV" style={{ display: "none" }} onChange={(e) => { uploadCsv(e.target.files?.[0] ?? null); e.target.value = ""; }} />
              </label>
              <span style={{ fontSize: "0.76rem", color: T.inkSoft }}>CSV: a period column (Q2 FY27) and revenue, EBITDA, PBT, PAT columns in ₹ crore; optional source and label columns.</span>
            </div>
          </form>
          {message && <p role={message.ok ? "status" : "alert"} style={{ fontSize: "0.82rem", color: message.ok ? T.inkSoft : T.oxblood, margin: "0.6rem 0 0 0" }}>{message.text}</p>}
          {waiting.length > 0 && (
            <p style={{ fontSize: "0.82rem", color: T.inkSoft, margin: "0.8rem 0 0 0" }} data-testid="estimates-waiting">
              Waiting for results: {waiting.map((w) => `${w.period_end_date} (${w.count} estimate${w.count === 1 ? "" : "s"})`).join(", ")}. The variance appears here once that quarter is imported.
            </p>
          )}
          {estimates.length > 0 && (
            <ul style={{ listStyle: "none", margin: "0.8rem 0 0 0", padding: 0, fontSize: "0.8rem", color: T.inkSoft }}>
              {estimates.slice(0, 24).map((e) => (
                <li key={e.id ?? `${e.period_end_date}${e.metric}${e.source}`} style={{ display: "flex", gap: "0.6rem", alignItems: "center", padding: "0.1rem 0" }}>
                  <span>{e.period_end_date} · {METRIC_LABEL[e.metric]} · {e.value_cr.toLocaleString("en-IN")} cr · {e.source === "own" ? "my estimate" : "consensus"}{e.source_label ? ` (${e.source_label})` : ""}</span>
                  {e.id && <button type="button" style={{ ...ghost, padding: "0.1rem 0.5rem" }} onClick={() => remove(e.id as string)}>Remove</button>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
