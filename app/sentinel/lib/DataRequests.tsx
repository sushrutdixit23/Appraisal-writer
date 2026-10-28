"use client";

// Sentinel - "ask the company for its numbers". The analyst opens a request for a period; a link goes to the company's CA
// or finance team, who upload a trial balance or statement export without logging in. What they send arrives here as a
// draft, read by the same rules as any file; "Add to this import" puts it in the Import preview, where nothing is saved
// until the analyst ticks it and presses Import. See lib/requests.ts and /api/sentinel/submit/[token].

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { CADENCES, isOverdue } from "./requestDates";
import type { AutofillResult } from "./autofill/types";
import { SERIF, T } from "./theme";

type RequestRow = { id: string; period_end_date: string; due_date: string | null; cadence: string | null; note: string | null; status: string; submitted_at: string | null };
type DraftRow = { id: string; request_id: string; source_file: string; result: AutofillResult };

const input: React.CSSProperties = { fontFamily: "inherit", fontSize: "0.84rem", padding: "0.35rem 0.5rem", border: `1px solid ${T.rule}`, borderRadius: 3, background: T.card, color: T.ink };
const btn: React.CSSProperties = { fontFamily: "inherit", fontSize: "0.8rem", fontWeight: 500, padding: "0.4rem 0.9rem", border: `1px solid ${T.accent}`, borderRadius: 3, background: T.accent, color: T.background, cursor: "pointer" };
const ghost: React.CSSProperties = { ...btn, background: "transparent", color: T.ink, border: `1px solid ${T.rule}` };

export function DataRequests({ workspaceId, onAddDraft }: { workspaceId: string; onAddDraft: (file: { name: string; result: AutofillResult; unit: AutofillResult["unit"]["unit"] }) => void }) {
  const [state, setState] = useState<{ requests: RequestRow[]; drafts: DraftRow[]; setUp: boolean } | null>(null);
  const [periodEnd, setPeriodEnd] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [cadence, setCadence] = useState("");
  const [note, setNote] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const call = useCallback(async (path: string, init?: RequestInit) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) } });
  }, []);

  const load = useCallback(async () => {
    const res = await call(`/api/sentinel/requests?workspace_id=${workspaceId}`);
    if (!res.ok) { setState({ requests: [], drafts: [], setUp: true }); return; }
    const body = (await res.json()) as { requests: RequestRow[]; drafts: DraftRow[]; set_up: boolean };
    setState({ requests: body.requests, drafts: body.drafts, setUp: body.set_up });
  }, [call, workspaceId]);
  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLink(null);
    setBusy(true);
    try {
      const res = await call("/api/sentinel/requests", { method: "POST", body: JSON.stringify({ workspace_id: workspaceId, period_end_date: periodEnd, due_date: dueDate || undefined, cadence: cadence || undefined, note: note || undefined }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string; submit_path?: string };
      if (!res.ok || !body.submit_path) { setError(body.error ?? "The request could not be created."); return; }
      setLink(`${window.location.origin}${body.submit_path}`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function settle(requestId: string, patch: Record<string, unknown>) {
    await call(`/api/sentinel/requests/${requestId}`, { method: "PATCH", body: JSON.stringify(patch) });
    await load();
  }

  const today = new Date().toISOString().slice(0, 10);
  return (
    <section aria-label="Request data from the company" data-testid="data-requests" style={{ background: T.card, border: `1px solid ${T.rule}`, borderRadius: 3, padding: "1.2rem 1.4rem", marginBottom: "1.2rem" }}>
      <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.15rem", margin: "0 0 0.3rem 0" }}>Ask the company or its CA for figures</h2>
      <p style={{ fontSize: "0.8rem", color: T.inkSoft, margin: "0 0 0.9rem 0", lineHeight: 1.55 }}>
        Open a request for a period and send the link. They upload a trial balance (Tally, Zoho, ERPNext, SAP - any export with ledger, debit and credit) or an
        Excel/PDF statement, with no login. It arrives below as a draft; nothing is recorded until you import it.
      </p>
      {state && !state.setUp ? (
        <p style={{ fontSize: "0.82rem", color: T.ochre, margin: 0 }}>Not set up on this database yet. Run <code>supabase/migrations/20261105000000_sentinel_data_requests.sql</code> in the Supabase SQL editor.</p>
      ) : (
        <>
          <form onSubmit={create} style={{ display: "flex", gap: "0.7rem", flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ fontSize: "0.76rem", color: T.inkSoft }}>Period ends<br /><input type="date" required value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} style={input} aria-label="Period ends" /></label>
            <label style={{ fontSize: "0.76rem", color: T.inkSoft }}>Due (optional)<br /><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={input} aria-label="Due date" /></label>
            <label style={{ fontSize: "0.76rem", color: T.inkSoft }}>Repeats<br />
              <select value={cadence} onChange={(e) => setCadence(e.target.value)} style={input} aria-label="Repeats">
                <option value="">Just this once</option>
                {CADENCES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label style={{ fontSize: "0.76rem", color: T.inkSoft, flex: 1, minWidth: 160 }}>Note to the CA (optional)<br /><input value={note} onChange={(e) => setNote(e.target.value)} style={{ ...input, width: "100%" }} aria-label="Note" /></label>
            <button type="submit" style={btn} disabled={busy || !periodEnd}>{busy ? "Creating..." : "Create upload link"}</button>
          </form>
          {error && <p role="alert" style={{ fontSize: "0.82rem", color: T.oxblood, margin: "0.6rem 0 0 0" }}>{error}</p>}
          {link && (
            <div role="status" data-testid="request-link" style={{ marginTop: "0.8rem", padding: "0.6rem 0.8rem", background: T.accentSoft, borderLeft: `2px solid ${T.accent}`, fontSize: "0.82rem" }}>
              Send this link to the CA. It is shown <strong>once</strong>; only a hash of it is kept.
              <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", marginTop: "0.4rem" }}>
                <code style={{ wordBreak: "break-all", flex: 1 }}>{link}</code>
                <button type="button" style={ghost} onClick={() => navigator.clipboard?.writeText(link)}>Copy</button>
              </div>
            </div>
          )}
          {state && state.drafts.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <p style={{ fontSize: "0.78rem", fontWeight: 600, margin: "0 0 0.3rem 0" }}>Received, waiting for your review</p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }} data-testid="drafts">
                {state.drafts.map((d) => (
                  <li key={d.id} style={{ display: "flex", gap: "0.7rem", alignItems: "center", flexWrap: "wrap", padding: "0.45rem 0", borderTop: `1px solid ${T.rule}`, fontSize: "0.82rem" }}>
                    <strong>{d.source_file}</strong>
                    <span style={{ color: T.inkSoft }}>{d.result.layout === "trial balance" ? "trial balance" : d.result.kind}, {d.result.periods.length} period(s), {d.result.periods.reduce((n, p) => n + Object.keys(p.fields).length, 0)} figures</span>
                    <button type="button" style={btn} onClick={async () => { onAddDraft({ name: d.source_file, result: d.result, unit: d.result.unit.unit }); await settle(d.request_id, { draft_id: d.id, status: "imported" }); }}>Add to this import</button>
                    <button type="button" style={ghost} onClick={() => settle(d.request_id, { draft_id: d.id, status: "dismissed" })}>Dismiss</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {state && state.requests.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <p style={{ fontSize: "0.78rem", fontWeight: 600, margin: "0 0 0.3rem 0" }}>Requests</p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }} data-testid="requests">
                {state.requests.map((r) => (
                  <li key={r.id} style={{ display: "flex", gap: "0.7rem", alignItems: "center", flexWrap: "wrap", padding: "0.4rem 0", borderTop: `1px solid ${T.rule}`, fontSize: "0.82rem" }}>
                    <span>Period to {r.period_end_date}</span>
                    <span style={{ color: isOverdue(r, today) ? T.oxblood : T.inkSoft }}>{r.status}{isOverdue(r, today) ? " - overdue" : ""}{r.cadence ? `, ${r.cadence}` : ""}</span>
                    {r.status !== "closed" && <button type="button" style={{ ...ghost, marginLeft: "auto" }} onClick={() => settle(r.id, { status: "closed" })}>Close link</button>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
