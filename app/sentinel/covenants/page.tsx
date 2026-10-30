"use client";
export const dynamic = "force-dynamic";

// Sentinel - the covenant tracker: the limits a lender has set on a company's ratios, tested against the latest annual statement on file, with the room
// left on each and the next test date. See lib/covenants.ts for what is computed and what it cannot know.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { workspaceOptionLabel } from "../lib/access";
import { COVENANT_METRICS, METRIC_INFO, TIGHT_HEADROOM, evaluateAll, rankResults, type CovenantMetric, type CovenantRow, type CovenantStatus } from "../lib/covenants";
import { useShell } from "../lib/shell/ShellData";
import { useSelectedWorkspace } from "../lib/useSelectedWorkspace";
import { SERIF, T } from "../lib/theme";
import type { FinancialStatement } from "../lib/types";

const input: React.CSSProperties = { fontFamily: "inherit", fontSize: "0.84rem", padding: "0.35rem 0.5rem", border: `1px solid ${T.rule}`, borderRadius: 3, background: T.card, color: T.ink, width: "100%", boxSizing: "border-box" };
const btn: React.CSSProperties = { fontFamily: "inherit", fontSize: "0.8rem", fontWeight: 500, padding: "0.4rem 0.9rem", border: `1px solid ${T.accent}`, borderRadius: 3, background: T.accent, color: T.background, cursor: "pointer" };
const ghost: React.CSSProperties = { ...btn, background: "transparent", color: T.ink, border: `1px solid ${T.rule}` };
const lab: React.CSSProperties = { fontSize: "0.74rem", color: T.inkSoft, display: "block", marginBottom: 3 };
const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.rule}`, borderRadius: 3, padding: "1rem 1.3rem", marginBottom: "1.1rem" };
const h2: React.CSSProperties = { fontFamily: SERIF, fontWeight: 500, fontSize: "1.15rem", margin: "0 0 0.6rem 0" };

const STATUS: Record<CovenantStatus, { text: string; bg: string; fg: string }> = {
  ok: { text: "Within limit", bg: "rgba(11,107,95,0.12)", fg: "#0b6b5f" },
  tight: { text: "Tight", bg: "rgba(176,110,0,0.14)", fg: "#8a5300" },
  breach: { text: "Breached", bg: "rgba(140,30,30,0.14)", fg: T.oxblood },
  unknown: { text: "Cannot test", bg: "rgba(0,0,0,0.06)", fg: T.inkSoft },
};

type Stored = CovenantRow & { id: string };

export default function CovenantsPage() {
  const router = useRouter();
  const { workspaces, userId, loading: shellLoading, signedIn } = useShell();
  const [statements, setStatements] = useState<FinancialStatement[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [primaryId] = useSelectedWorkspace(workspaces.map((w) => w.id));
  const [covenants, setCovenants] = useState<Stored[]>([]);
  const [setUp, setSetUp] = useState(true);
  const [tick, setTick] = useState(0);
  const [form, setForm] = useState({ name: "", metric: "net_debt_ebitda" as CovenantMetric, limit: "", date: "", notes: "" });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (shellLoading) return;
    if (!signedIn) { router.push("/login"); return; }
    (async () => {
      const ids = workspaces.map((w) => w.id);
      const st = ids.length ? await supabase.from("sentinel_statements").select("*").in("workspace_id", ids) : { data: [] };
      setStatements((st.data ?? []) as FinancialStatement[]);
      setLoaded(true);
    })();
  }, [shellLoading, signedIn, workspaces, router]);

  const ws = workspaces.find((w) => w.id === primaryId) ?? null;
  const wsId = ws?.id;
  const canWrite = !!ws && ws.owner_id === userId;

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token, []);
  useEffect(() => {
    if (!wsId) return;
    (async () => {
      const t = await token();
      if (!t) return;
      const res = await fetch(`/api/sentinel/covenants?workspace_id=${wsId}`, { headers: { Authorization: `Bearer ${t}` } }).catch(() => null);
      if (!res || !res.ok) { setCovenants([]); return; }
      const body = (await res.json()) as { covenants: Stored[]; set_up: boolean };
      setCovenants(body.covenants);
      setSetUp(body.set_up);
    })();
  }, [wsId, tick, token]);

  const today = new Date().toISOString().slice(0, 10);
  const results = useMemo(() => rankResults(evaluateAll(covenants, statements, workspaces, today)), [covenants, statements, workspaces, today]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!wsId) return;
    setMessage(null);
    const limit = Number(form.limit.replace(/,/g, "").trim());
    if (!form.limit.trim() || !Number.isFinite(limit)) { setMessage({ ok: false, text: "The limit must be a number, such as 3 for 3.0x." }); return; }
    setBusy(true);
    try {
      const t = await token();
      const res = await fetch("/api/sentinel/covenants", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify({ workspace_id: wsId, name: form.name, metric: form.metric, comparator: METRIC_INFO[form.metric].comparator, limit_value: limit, next_test_date: form.date || null, notes: form.notes }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setMessage({ ok: false, text: body.error ?? "The covenant could not be saved." }); return; }
      setMessage({ ok: true, text: "Covenant saved." });
      setForm({ name: "", metric: form.metric, limit: "", date: "", notes: "" });
      setTick((n) => n + 1);
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    const t = await token();
    const res = await fetch(`/api/sentinel/covenants?id=${id}`, { method: "DELETE", headers: t ? { Authorization: `Bearer ${t}` } : {} });
    if (res.ok) setTick((n) => n + 1);
  }

  if (shellLoading || !loaded) return <p style={{ color: T.inkSoft }}>Testing the covenants...</p>;
  if (!ws) return <p style={{ color: T.inkSoft }}>No company selected.</p>;

  const th: React.CSSProperties = { textAlign: "right", fontSize: "0.68rem", letterSpacing: "0.08em", textTransform: "uppercase", color: T.inkSoft, fontWeight: 500, padding: "0.5rem 0.7rem", borderBottom: `1px solid ${T.rule}`, whiteSpace: "nowrap" };
  const td: React.CSSProperties = { fontSize: "0.88rem", padding: "0.55rem 0.7rem", borderBottom: `1px solid ${T.rule}`, textAlign: "right", fontVariantNumeric: "tabular-nums" };

  return (
    <div style={{ maxWidth: 1000 }}>
      <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0, color: T.accent }}>Covenants</h1>
      <p style={{ fontSize: "0.9rem", color: T.inkSoft, margin: "0.5rem 0 1.2rem 0", lineHeight: 1.6, maxWidth: "72ch" }}>
        The limits a lender has set on {ws.company_name}&apos;s ratios, tested against the latest annual statement on file. The ratio is computed from the filed
        statement; a facility agreement may define its terms differently (adjusted EBITDA, leases counted as debt, a rolling twelve months, a half-yearly test), so treat
        this as a close read and check the lender&apos;s own compliance certificate. Less than {Math.round(TIGHT_HEADROOM * 100)}% of room is marked tight (a starting assumption).
      </p>
      <p style={{ fontSize: "0.9rem", margin: "0 0 1.2rem 0" }}><strong>{ws.company_name}</strong> <span style={{ color: T.inkSoft }}>({workspaceOptionLabel(ws, userId)})</span></p>

      {!setUp && <div style={card}><p style={{ margin: 0, fontSize: "0.88rem" }}>Covenants are not set up on this database yet (run migration 20261111000000).</p></div>}

      {setUp && results.length === 0 && (
        <div style={card} data-testid="covenants-empty">
          <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.6 }}>
            No covenants entered for {ws.company_name}. {canWrite ? "Add the first below." : "Reference companies are read-only; create your own project to track covenants."}{" "}
            {statements.some((s) => s.workspace_id === ws.id && s.period_type === "FY") ? "" : <>There is also no annual statement yet: <Link href={`/sentinel/projects/${ws.id}/import`} style={{ color: T.accent }}>import one</Link> so there is something to test.</>}
          </p>
        </div>
      )}

      {results.length > 0 && (
        <section style={card} aria-label="Covenant tests" data-testid="covenants-table">
          <h2 style={h2}>Tested on the latest annual statement</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: "left" }}>Covenant</th><th style={th}>Limit</th><th style={th}>Actual</th><th style={th}>Room</th><th style={th}>Next test</th><th style={{ ...th, textAlign: "left" }}>Status</th>
                  {canWrite && <th style={th} />}
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const s = STATUS[r.status];
                  const c = r.covenant as Stored;
                  return (
                    <tr key={c.id} data-testid="covenant-row">
                      <td style={{ ...td, textAlign: "left" }}>
                        <div style={{ fontWeight: 500 }}>{c.name}</div>
                        <div style={{ fontSize: "0.78rem", color: T.inkSoft }}>{METRIC_INFO[c.metric].label} {c.comparator === "max" ? "at most" : "at least"} {c.limit_value}x{c.notes ? ` - ${c.notes}` : ""}</div>
                      </td>
                      <td style={td}>{c.limit_value.toFixed(2)}x</td>
                      <td style={td}>{r.value == null ? "-" : `${r.value.toFixed(2)}x`}{r.period_label ? <div style={{ fontSize: "0.72rem", color: T.inkSoft }}>{r.period_label}</div> : null}</td>
                      <td style={td}>{r.headroom == null ? "-" : `${r.headroom < 0 ? "-" : ""}${Math.abs(r.headroom * 100).toFixed(0)}%`}{r.ebitda_cushion != null && r.status !== "breach" ? <div style={{ fontSize: "0.72rem", color: T.inkSoft }}>EBITDA can fall {(r.ebitda_cushion * 100).toFixed(0)}%</div> : null}</td>
                      <td style={td}>{c.next_test_date ?? "-"}{r.days_to_test != null ? <div style={{ fontSize: "0.72rem", color: T.inkSoft }}>{r.days_to_test < 0 ? `${-r.days_to_test} days ago` : `in ${r.days_to_test} days`}</div> : null}</td>
                      <td style={{ ...td, textAlign: "left" }}>
                        <span style={{ background: s.bg, color: s.fg, padding: "0.15rem 0.5rem", borderRadius: 3, fontSize: "0.76rem", fontWeight: 600 }}>{s.text}</span>
                        <div style={{ fontSize: "0.74rem", color: T.inkSoft, marginTop: 4, maxWidth: 300, lineHeight: 1.4 }}>{r.reason}</div>
                      </td>
                      {canWrite && <td style={td}><button type="button" style={ghost} onClick={() => remove(c.id)} aria-label={`Remove ${c.name}`}>Remove</button></td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {setUp && canWrite && (
        <section style={card} aria-label="Add a covenant">
          <h2 style={h2}>Add a covenant</h2>
          <form onSubmit={save}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.7rem", alignItems: "end" }}>
              <div><label style={lab} htmlFor="cov-name">Lender or facility</label><input id="cov-name" style={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Term loan A" /></div>
              <div>
                <label style={lab} htmlFor="cov-metric">Ratio</label>
                <select id="cov-metric" style={input} value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value as CovenantMetric })}>
                  {COVENANT_METRICS.map((m) => <option key={m} value={m}>{METRIC_INFO[m].label} ({METRIC_INFO[m].comparator === "max" ? "at most" : "at least"})</option>)}
                </select>
              </div>
              <div><label style={lab} htmlFor="cov-limit">Limit (x)</label><input id="cov-limit" style={input} inputMode="decimal" value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value })} placeholder="3.0" /></div>
              <div><label style={lab} htmlFor="cov-date">Next test date</label><input id="cov-date" type="date" style={input} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              <div><label style={lab} htmlFor="cov-notes">Note (optional)</label><input id="cov-notes" style={input} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Tested half-yearly" /></div>
            </div>
            <p style={{ fontSize: "0.76rem", color: T.inkSoft, margin: "0.6rem 0" }}>{METRIC_INFO[form.metric].label} = {METRIC_INFO[form.metric].formula}.</p>
            <button type="submit" style={btn} disabled={busy}>{busy ? "Saving..." : "Add covenant"}</button>
            {message && <span role={message.ok ? "status" : "alert"} style={{ marginLeft: 12, fontSize: "0.82rem", color: message.ok ? "#0b6b5f" : T.oxblood }}>{message.text}</span>}
          </form>
        </section>
      )}
    </div>
  );
}
