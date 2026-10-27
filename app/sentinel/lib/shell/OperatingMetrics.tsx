"use client";

// Sentinel - operating metrics on a project's Overview: attrition, utilisation, headcount, order book and the like,
// recorded by hand with where each was read. They are not in the financial statements, so they are kept apart from
// them, and the narrative is told only about the ones recorded here. Reads the table directly (RLS decides who sees
// what); writes go through /api/sentinel/metrics, which checks ownership. If the table does not exist yet (the
// migration is not applied), the owner sees what to do and everyone else sees nothing.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { SANS, SERIF, T } from "../theme";
import { METRIC_PRESETS, formatMetricValue, metricLabel, type MetricRow } from "../metrics";

const input: React.CSSProperties = { padding: "0.45rem 0.6rem", border: `1px solid ${T.rule}`, borderRadius: 3, background: T.card, color: T.ink, fontFamily: "inherit", fontSize: "0.85rem" };
const OTHER = "__other__";

export function OperatingMetrics({ workspaceId, canWrite }: { workspaceId: string; canWrite: boolean }) {
  const [rows, setRows] = useState<(MetricRow & { id: string })[] | null>(null);
  const [missingTable, setMissingTable] = useState(false);
  const [metric, setMetric] = useState(METRIC_PRESETS[0].key);
  const [custom, setCustom] = useState("");
  const [period, setPeriod] = useState("");
  const [value, setValue] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("sentinel_operating_metrics")
      .select("id,period_label,metric,value,unit,source")
      .eq("workspace_id", workspaceId)
      .order("period_label", { ascending: false })
      .limit(60);
    if (error) {
      setMissingTable(true);
      setRows([]);
      return;
    }
    setMissingTable(false);
    setRows((data ?? []) as (MetricRow & { id: string })[]);
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  async function call(method: "POST" | "DELETE", body: Record<string, unknown>) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { ok: false, text: "Please log in again." };
    const res = await fetch("/api/sentinel/metrics", {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ workspace_id: workspaceId, ...body }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return res.ok ? { ok: true, text: "" } : { ok: false, text: json.error ?? `Failed (${res.status}).` };
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const name = metric === OTHER ? custom.trim() : metric;
    const r = await call("POST", { metric: name, period_label: period.trim(), value, source });
    setBusy(false);
    if (!r.ok) return setMessage({ ok: false, text: r.text });
    setMessage({ ok: true, text: `Saved ${metricLabel(name)} for ${period.trim()}.` });
    setValue("");
    await load();
  }

  async function remove(r: MetricRow) {
    setBusy(true);
    const out = await call("DELETE", { metric: r.metric, period_label: r.period_label });
    setBusy(false);
    if (!out.ok) return setMessage({ ok: false, text: out.text });
    await load();
  }

  if (rows === null) return null;
  if (missingTable && !canWrite) return null;
  if (!missingTable && rows.length === 0 && !canWrite) return null;

  return (
    <section aria-label="Operating metrics" style={{ marginBottom: "1.8rem" }} data-testid="operating-metrics">
      <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.15rem", margin: "0 0 0.3rem 0" }}>Operating metrics</h2>
      <p style={{ fontSize: "0.8rem", color: T.inkSoft, margin: "0 0 0.7rem 0", maxWidth: "46rem" }}>
        Measures that are not in the financial statements. Enter them from the investor presentation or annual report and say where you read them;
        the narrative only mentions the ones recorded here.
      </p>

      {missingTable ? (
        <p role="status" style={{ fontSize: "0.82rem", color: T.concern }}>
          Operating metrics need a one-time database step before they can be saved: run supabase/migrations/20261030000000_sentinel_operating_metrics.sql in the Supabase SQL editor.
        </p>
      ) : (
        <>
          {rows.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", marginBottom: "0.8rem" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: `1px solid ${T.rule}`, fontFamily: SANS, fontSize: "0.68rem", letterSpacing: "0.08em", textTransform: "uppercase", color: T.inkSoft }}>
                  <th scope="col" style={{ padding: "0.4rem 0.6rem 0.4rem 0" }}>Period</th>
                  <th scope="col" style={{ padding: "0.4rem 0.6rem" }}>Metric</th>
                  <th scope="col" style={{ padding: "0.4rem 0.6rem", textAlign: "right" }}>Value</th>
                  <th scope="col" style={{ padding: "0.4rem 0.6rem" }}>Source</th>
                  {canWrite && <th scope="col" style={{ padding: "0.4rem 0" }}><span style={{ position: "absolute", left: -9999 }}>Remove</span></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${T.rule}` }}>
                    <td style={{ padding: "0.45rem 0.6rem 0.45rem 0" }}>{r.period_label}</td>
                    <td style={{ padding: "0.45rem 0.6rem" }}>{metricLabel(r.metric)}</td>
                    <td style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatMetricValue(r)}</td>
                    <td style={{ padding: "0.45rem 0.6rem", color: T.inkSoft }}>{r.source ?? ""}</td>
                    {canWrite && (
                      <td style={{ padding: "0.45rem 0", textAlign: "right" }}>
                        <button type="button" disabled={busy} onClick={() => remove(r)} aria-label={`Remove ${metricLabel(r.metric)} for ${r.period_label}`} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: "0.8rem" }}>
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {canWrite && (
            <form onSubmit={add} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={{ display: "grid", gap: 3, fontSize: "0.72rem", color: T.inkSoft }}>Metric
                <select value={metric} onChange={(e) => setMetric(e.target.value)} style={input} aria-label="Metric">
                  {METRIC_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                  <option value={OTHER}>Other (name it)...</option>
                </select>
              </label>
              {metric === OTHER && (
                <label style={{ display: "grid", gap: 3, fontSize: "0.72rem", color: T.inkSoft }}>Name
                  <input value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={60} style={input} aria-label="Metric name" />
                </label>
              )}
              <label style={{ display: "grid", gap: 3, fontSize: "0.72rem", color: T.inkSoft }}>Period
                <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="Q3 FY26" maxLength={40} style={{ ...input, width: "7rem" }} aria-label="Period" />
              </label>
              <label style={{ display: "grid", gap: 3, fontSize: "0.72rem", color: T.inkSoft }}>Value
                <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" style={{ ...input, width: "7rem" }} aria-label="Value" />
              </label>
              <label style={{ display: "grid", gap: 3, fontSize: "0.72rem", color: T.inkSoft, flex: "1 1 14rem" }}>Where you read it
                <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Q3 investor deck, p.12" maxLength={200} style={input} aria-label="Source" />
              </label>
              <button type="submit" disabled={busy || !period.trim() || !value.trim() || (metric === OTHER && !custom.trim())} style={{ ...input, background: T.accent, color: T.background, border: `1px solid ${T.accent}`, cursor: "pointer", fontWeight: 600 }}>
                Add metric
              </button>
            </form>
          )}
          {message && <p role={message.ok ? "status" : "alert"} style={{ fontSize: "0.8rem", marginTop: "0.5rem", color: message.ok ? T.green : T.oxblood }}>{message.text}</p>}
        </>
      )}
    </section>
  );
}
