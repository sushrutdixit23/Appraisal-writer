"use client";
export const dynamic = "force-dynamic";

// Sentinel - the portfolio: what you hold, how big each position is, and which positions have something worth reading under them. See lib/portfolio.ts.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { useShell } from "../lib/shell/ShellData";
import { buildPortfolio, pctOf, type HoldingRow } from "../lib/portfolio";
import type { CovenantRow } from "../lib/covenants";
import { SERIF, T } from "../lib/theme";
import type { FinancialStatement } from "../lib/types";

const rupees = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const BASIS_TEXT = {
  market: "Weights are by market value: quantity times the price on each company's Settings page.",
  cost: "Weights are by cost (quantity times average cost), because at least one holding has no price. Add a price under that company's Settings to weight by market value.",
  equal: "Weights are equal, because at least one holding has no price and at least one has no average cost. Add prices under each company's Settings, or an average cost here.",
} as const;

type ImportResult = { saved: number; removed: number; unmatched: { line: number; label: string; reason: string }[] };

export default function PortfolioPage() {
  const router = useRouter();
  const { workspaces, userId, loading: shellLoading, signedIn } = useShell();
  const [loaded, setLoaded] = useState(false);
  const [statements, setStatements] = useState<FinancialStatement[]>([]);
  const [covenants, setCovenants] = useState<CovenantRow[]>([]);
  const [holdings, setHoldings] = useState<(HoldingRow & { id: string })[]>([]);
  const [setUp, setSetUp] = useState(true);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [form, setForm] = useState({ workspace_id: "", quantity: "", avg_cost: "" });
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);

  const call = useCallback(async (method: string, body?: unknown, query = "") => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const r = await fetch(`/api/sentinel/holdings${query}`, { method, headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { ok: r.ok, status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, any> };
  }, []);

  const loadHoldings = useCallback(async () => {
    const r = await call("GET");
    setHoldings((r.json.holdings ?? []) as (HoldingRow & { id: string })[]);
    setSetUp(r.json.set_up !== false);
  }, [call]);

  useEffect(() => {
    if (shellLoading) return;
    if (!signedIn) { router.push("/login"); return; }
    (async () => {
      const ids = workspaces.map((w) => w.id);
      const st = ids.length ? await supabase.from("sentinel_statements").select("*").in("workspace_id", ids) : { data: [] };
      setStatements((st.data ?? []) as FinancialStatement[]);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (token) {
        const own = workspaces.filter((w) => w.owner_id === userId);
        const lists = await Promise.all(own.map((w) => fetch(`/api/sentinel/covenants?workspace_id=${w.id}`, { headers: { Authorization: `Bearer ${token}` } }).then((r): Promise<{ covenants?: CovenantRow[] }> => (r.ok ? r.json() : Promise.resolve({}))).catch(() => ({} as { covenants?: CovenantRow[] }))));
        setCovenants(lists.flatMap((l) => l.covenants ?? []));
      }
      await loadHoldings();
      setLoaded(true);
    })();
  }, [shellLoading, signedIn, workspaces, userId, router, loadHoldings]);

  const today = new Date().toISOString().slice(0, 10);
  const portfolio = useMemo(() => buildPortfolio(holdings, workspaces, statements, covenants, today), [holdings, workspaces, statements, covenants, today]);
  const heldIds = new Set(holdings.map((h) => h.workspace_id));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null); setBusy(true);
    const r = await call("POST", { workspace_id: form.workspace_id, quantity: Number(form.quantity), avg_cost: form.avg_cost.trim() === "" ? null : Number(form.avg_cost) });
    setBusy(false);
    if (!r.ok) { setMessage({ kind: "error", text: String(r.json.error ?? "Could not save.") }); return; }
    setMessage({ kind: "ok", text: "Saved." });
    setForm({ workspace_id: "", quantity: "", avg_cost: "" });
    await loadHoldings();
  }

  async function remove(id: string) {
    setMessage(null);
    const r = await call("DELETE", undefined, `?id=${id}`);
    if (!r.ok) { setMessage({ kind: "error", text: String(r.json.error ?? "Could not remove.") }); return; }
    await loadHoldings();
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setMessage(null); setImported(null); setBusy(true);
    const r = await call("POST", { csv: await file.text(), replace });
    setBusy(false);
    if (!r.ok) { setMessage({ kind: "error", text: String(r.json.error ?? "Could not read that file.") }); return; }
    setImported(r.json as ImportResult);
    await loadHoldings();
  }

  if (shellLoading || !loaded) return <p style={{ color: T.inkSoft }}>Building your portfolio...</p>;
  const th: React.CSSProperties = { textAlign: "left", fontSize: "0.7rem", letterSpacing: "0.08em", textTransform: "uppercase", color: T.inkSoft, fontWeight: 500, padding: "0.5rem 0.7rem", borderBottom: `1px solid ${T.rule}` };
  const td: React.CSSProperties = { fontSize: "0.88rem", padding: "0.65rem 0.7rem", borderBottom: `1px solid ${T.rule}`, verticalAlign: "top" };
  const field: React.CSSProperties = { font: "inherit", fontSize: "0.88rem", padding: "0.4rem 0.55rem", border: `1px solid ${T.rule}`, borderRadius: 3, background: T.card, color: T.ink };
  const button: React.CSSProperties = { font: "inherit", fontSize: "0.85rem", padding: "0.45rem 0.9rem", border: `1px solid ${T.accent}`, borderRadius: 3, background: T.accent, color: "#fff", cursor: "pointer" };
  const ghost: React.CSSProperties = { ...button, background: "transparent", color: T.accent };

  return (
    <div style={{ maxWidth: 1040 }}>
      <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0, color: T.accent }}>Portfolio</h1>
      <p style={{ fontSize: "0.9rem", color: T.inkSoft, margin: "0.5rem 0 1.2rem 0", lineHeight: 1.6, maxWidth: "70ch" }}>
        What you hold, ordered by how much of your book sits under a finding: a position&apos;s weight times what the notes to its latest annual report, the auditor&apos;s
        report and any covenant say. It orders your reading; it is not a measure of risk. Your holdings are private to you.
      </p>

      {!setUp && (
        <p data-testid="holdings-not-set-up" style={{ fontSize: "0.88rem", color: T.ochre, lineHeight: 1.6 }}>
          Holdings are not set up on this database yet. Run <code>supabase/migrations/20261113000000_sentinel_holdings.sql</code> in the Supabase SQL editor, then reload.
        </p>
      )}

      {portfolio.positions.length > 0 && (
        <>
          <div data-testid="portfolio-summary" style={{ display: "flex", flexWrap: "wrap", gap: "1.6rem", background: T.card, border: `1px solid ${T.rule}`, borderRadius: 3, padding: "0.9rem 1.2rem", marginBottom: "0.6rem" }}>
            <Stat label="Holdings" value={String(portfolio.positions.length)} />
            <Stat label="Book under a high finding" value={pctOf(portfolio.share_high)} />
            <Stat label="Book with no annual report read" value={pctOf(portfolio.share_blind)} />
            <Stat label="Book whose next report should be out" value={pctOf(portfolio.share_newer)} />
            {portfolio.basis === "market" && <Stat label="Market value" value={rupees(portfolio.total)} />}
          </div>
          <p data-testid="portfolio-basis" style={{ fontSize: "0.82rem", color: T.inkSoft, lineHeight: 1.55, margin: "0 0 1rem 0" }}>
            {BASIS_TEXT[portfolio.basis]} &quot;No annual report read&quot; is a blind spot, not a clean result: nothing was found because nothing was read.
          </p>
          <div style={{ overflowX: "auto", background: T.card, border: `1px solid ${T.rule}`, borderRadius: 3 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }} data-testid="portfolio-table">
              <thead>
                <tr>
                  <th style={th}>Company</th><th style={th}>Weight</th><th style={th}>Price</th><th style={th}>Gain</th><th style={th}>Annual report read</th><th style={th}>Findings</th><th style={th}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {portfolio.positions.map((p) => (
                  <tr key={p.holding.workspace_id} data-testid={`position-${p.workspace.company_name}`}>
                    <td style={td}>
                      <Link href={`/sentinel/projects/${p.workspace.id}`} style={{ color: T.accent, fontWeight: 500, textDecoration: "none" }}>{p.workspace.company_name}</Link>
                      <div style={{ fontSize: "0.78rem", color: T.inkSoft }}>{p.holding.quantity.toLocaleString("en-IN")} shares{p.value != null ? ` - ${rupees(p.value)}` : ""}</div>
                    </td>
                    <td style={td}>{pctOf(p.weight)}</td>
                    <td style={td}>
                      {p.price != null ? `${rupees(p.price)}` : <Link href={`/sentinel/projects/${p.workspace.id}/settings`} style={{ color: T.ochre }}>no price</Link>}
                      {p.price_stale && <div style={{ fontSize: "0.75rem", color: T.ochre }}>priced {p.price_as_of ?? "(no date)"}, out of date</div>}
                    </td>
                    <td style={td}>{p.gain == null ? "-" : `${p.gain >= 0 ? "+" : ""}${(p.gain * 100).toFixed(1)}%`}</td>
                    <td style={td}>
                      {p.notes_year ? p.notes_year : <span style={{ color: T.ochre }}>not read</span>}
                      {p.report_status === "newer_may_exist" && <div style={{ fontSize: "0.75rem", color: T.ochre }}>a newer report should be out</div>}
                      {p.report_status === "none" && <div style={{ fontSize: "0.75rem", color: T.ochre }}>no statements on file</div>}
                    </td>
                    <td style={{ ...td, minWidth: 280 }}>
                      {p.findings.length === 0 ? <span style={{ color: T.inkSoft }}>{p.notes_year ? "none high or medium" : "-"}</span> : (
                        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                          {p.findings.slice(0, 3).map((f, i) => (
                            <li key={i} data-testid="position-finding" style={{ fontSize: "0.82rem", lineHeight: 1.5, marginBottom: "0.3rem" }}>
                              <span style={{ color: f.severity === "high" ? T.oxblood : T.ochre, fontWeight: 600 }}>{f.severity === "high" ? "High" : "Medium"}</span> {f.title}
                              {f.page != null && <span style={{ color: T.inkSoft }}> (p.{f.page})</span>}
                            </li>
                          ))}
                          {p.findings.length > 3 && <li style={{ fontSize: "0.78rem", color: T.inkSoft }}>{p.findings.length - 3} more on the project page</li>}
                        </ul>
                      )}
                    </td>
                    <td style={td}>
                      <button type="button" style={{ ...ghost, padding: "0.25rem 0.6rem" }} onClick={() => setForm({ workspace_id: p.holding.workspace_id, quantity: String(p.holding.quantity), avg_cost: p.holding.avg_cost == null ? "" : String(p.holding.avg_cost) })}>Edit</button>{" "}
                      <button type="button" style={{ ...ghost, padding: "0.25rem 0.6rem" }} onClick={() => p.holding.id && remove(p.holding.id)} aria-label={`Remove ${p.workspace.company_name}`}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {portfolio.unpriced.length > 0 && <p data-testid="portfolio-unpriced" style={{ fontSize: "0.82rem", color: T.ochre, margin: "0.6rem 0 0 0" }}>No price on file: {portfolio.unpriced.join(", ")}.</p>}
        </>
      )}

      {setUp && portfolio.positions.length === 0 && (
        <p data-testid="portfolio-empty" style={{ fontSize: "0.9rem", color: T.inkSoft }}>No holdings yet. Add one below, or upload the holdings file from your broker.</p>
      )}

      <section style={{ marginTop: "1.8rem", display: "grid", gap: "1.4rem", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <form onSubmit={save} data-testid="holding-form" style={{ background: T.card, border: `1px solid ${T.rule}`, borderRadius: 3, padding: "1rem 1.2rem" }}>
          <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.1rem", margin: "0 0 0.7rem 0" }}>Add or change a holding</h2>
          <label style={{ display: "block", fontSize: "0.8rem", color: T.inkSoft, marginBottom: "0.6rem" }}>
            Company
            <select aria-label="Company" value={form.workspace_id} onChange={(e) => setForm({ ...form, workspace_id: e.target.value })} required style={{ ...field, display: "block", width: "100%", marginTop: "0.2rem" }}>
              <option value="">Choose a company</option>
              {workspaces.map((w) => <option key={w.id} value={w.id}>{w.company_name}{heldIds.has(w.id) ? " (held)" : ""}</option>)}
            </select>
          </label>
          <div style={{ display: "flex", gap: "0.8rem", marginBottom: "0.8rem" }}>
            <label style={{ flex: 1, fontSize: "0.8rem", color: T.inkSoft }}>
              Quantity
              <input aria-label="Quantity" type="number" min="0" step="any" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} style={{ ...field, display: "block", width: "100%", marginTop: "0.2rem" }} />
            </label>
            <label style={{ flex: 1, fontSize: "0.8rem", color: T.inkSoft }}>
              Average cost per share (optional)
              <input aria-label="Average cost" type="number" min="0" step="any" value={form.avg_cost} onChange={(e) => setForm({ ...form, avg_cost: e.target.value })} style={{ ...field, display: "block", width: "100%", marginTop: "0.2rem" }} />
            </label>
          </div>
          <button type="submit" disabled={busy} style={button}>Save holding</button>
          <p style={{ fontSize: "0.78rem", color: T.inkSoft, margin: "0.7rem 0 0 0", lineHeight: 1.5 }}>The company has to be a project first (yours or a reference company). Saving a company you already hold replaces that row.</p>
        </form>

        <div data-testid="holdings-import" style={{ background: T.card, border: `1px solid ${T.rule}`, borderRadius: 3, padding: "1rem 1.2rem" }}>
          <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.1rem", margin: "0 0 0.7rem 0" }}>Upload a holdings file</h2>
          <p style={{ fontSize: "0.82rem", color: T.inkSoft, margin: "0 0 0.7rem 0", lineHeight: 1.55 }}>
            A CSV from your broker with a company column (Symbol, Company or BSE code) and Quantity; Average cost or Invested value is optional. Rows are matched by BSE code, then
            symbol, then company name against your projects. A row that matches nothing is listed with the reason, never guessed.
          </p>
          <input aria-label="Holdings file" type="file" accept=".csv,.txt,text/csv" disabled={busy} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
          <label style={{ display: "block", fontSize: "0.82rem", color: T.inkSoft, marginTop: "0.7rem" }}>
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> This file is my whole book: remove holdings it does not list
          </label>
        </div>
      </section>

      {message && <p role="status" data-testid="holdings-message" style={{ fontSize: "0.88rem", color: message.kind === "ok" ? T.green : T.oxblood, marginTop: "1rem" }}>{message.text}</p>}
      {imported && (
        <div data-testid="import-result" style={{ marginTop: "1rem", fontSize: "0.88rem", lineHeight: 1.6 }}>
          <p style={{ margin: 0 }}>{imported.saved} holding{imported.saved === 1 ? "" : "s"} saved{imported.removed ? `, ${imported.removed} removed` : ""}{imported.unmatched.length ? `; ${imported.unmatched.length} row${imported.unmatched.length === 1 ? "" : "s"} not used:` : "."}</p>
          {imported.unmatched.length > 0 && (
            <ul style={{ margin: "0.3rem 0 0 1.1rem", padding: 0, color: T.ochre }}>
              {imported.unmatched.map((u, i) => <li key={i}>Line {u.line}, {u.label}: {u.reason}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontFamily: SERIF, fontSize: "1.5rem", color: T.accent, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: "0.72rem", color: T.inkSoft, letterSpacing: "0.04em", textTransform: "uppercase", marginTop: "0.2rem" }}>{label}</div>
    </div>
  );
}
