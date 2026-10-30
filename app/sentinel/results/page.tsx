"use client";
export const dynamic = "force-dynamic";

// Sentinel - the results-day brief: one company's quarter against the previous quarter, the same quarter last year, the trailing twelve months and
// the peers that have reported. Everything on the page is a subtraction or ratio of imported lines (see lib/quarterly.ts); nothing is a model's say-so.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { workspaceOptionLabel } from "../lib/access";
import { useShell } from "../lib/shell/ShellData";
import { useSelectedWorkspace } from "../lib/useSelectedWorkspace";
import { buildResultsBrief, quartersOnFile, type BriefLine } from "../lib/quarterly";
import { buildVariance, type EstimateRow } from "../lib/estimates";
import { EstimatesPanel } from "../lib/EstimatesPanel";
import { resultsWindow } from "../lib/resultsCalendar";
import { SERIF, T } from "../lib/theme";
import type { FinancialStatement } from "../lib/types";

const amount = (v: number | null) => (v == null ? "-" : `${v.toLocaleString("en-IN", { maximumFractionDigits: Math.abs(v) < 100 ? 1 : 0 })}`);
const pct = (v: number | null, dp = 1) => (v == null ? "-" : `${(v * 100).toFixed(dp)}%`);
const signed = (v: number | null, dp = 1) => (v == null ? "-" : `${v >= 0 ? "+" : "-"}${Math.abs(v * 100).toFixed(dp)}%`);
const bps = (v: number | null) => (v == null ? "-" : `${v >= 0 ? "+" : "-"}${Math.abs(Math.round(v * 10_000))} bps`);

const show = (l: BriefLine, v: number | null) => (l.kind === "amount" ? amount(v) : pct(v));
const delta = (l: BriefLine, v: number | null) => (l.kind === "amount" ? signed(v) : bps(v));

export default function ResultsPage() {
  const router = useRouter();
  const { workspaces, userId, loading: shellLoading, signedIn } = useShell();
  const [statements, setStatements] = useState<FinancialStatement[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [primaryId] = useSelectedWorkspace(workspaces.map((w) => w.id));
  const [quarter, setQuarter] = useState("");
  const [estimates, setEstimates] = useState<(EstimateRow & { id?: string })[]>([]);
  const [estimatesSetUp, setEstimatesSetUp] = useState(true);
  const [estimatesTick, setEstimatesTick] = useState(0);

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
  useEffect(() => {
    if (!wsId) return;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await fetch(`/api/sentinel/estimates?workspace_id=${wsId}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
      if (!res || !res.ok) { setEstimates([]); return; }
      const body = (await res.json()) as { estimates: (EstimateRow & { id?: string })[]; set_up: boolean };
      setEstimates(body.estimates);
      setEstimatesSetUp(body.set_up);
    })();
  }, [wsId, estimatesTick]);
  const quarters = useMemo(() => (ws ? quartersOnFile(ws, statements) : []), [ws, statements]);
  const end = quarters.find((q) => q.end === quarter)?.end ?? quarters[0]?.end;
  const brief = useMemo(() => (ws && end ? buildResultsBrief(workspaces, statements, ws.id, end) : null), [workspaces, statements, ws, end]);

  if (shellLoading || !loaded) return <p style={{ color: T.inkSoft }}>Building the brief...</p>;
  if (!ws) return <p style={{ color: T.inkSoft }}>No company selected.</p>;
  const variance = brief ? buildVariance(brief, estimates) : [];
  const reportedEnds = new Set(quarters.map((q) => q.end));
  const nextEnd = resultsWindow(new Date().toISOString().slice(0, 10), ws.fiscal_year_start_month || 4);
  const defaultPeriod = brief && !reportedEnds.has(nextEnd.latest.period_end_date) ? nextEnd.latest.period_end_date : nextEnd.next.period_end_date;
  const CALL: Record<string, { text: string; bg: string; fg: string }> = {
    beat: { text: "Beat", bg: "rgba(11,107,95,0.12)", fg: "#0b6b5f" },
    miss: { text: "Miss", bg: "rgba(140,30,30,0.14)", fg: T.oxblood },
    "in line": { text: "In line", bg: "rgba(0,0,0,0.06)", fg: T.inkSoft },
  };

  const th: React.CSSProperties = { textAlign: "right", fontSize: "0.68rem", letterSpacing: "0.08em", textTransform: "uppercase", color: T.inkSoft, fontWeight: 500, padding: "0.5rem 0.7rem", borderBottom: `1px solid ${T.rule}`, whiteSpace: "nowrap" };
  const td: React.CSSProperties = { fontSize: "0.88rem", padding: "0.55rem 0.7rem", borderBottom: `1px solid ${T.rule}`, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.rule}`, borderRadius: 3, padding: "1rem 1.3rem", marginBottom: "1.1rem" };
  const h2: React.CSSProperties = { fontFamily: SERIF, fontWeight: 500, fontSize: "1.15rem", margin: "0 0 0.6rem 0" };

  return (
    <div style={{ maxWidth: 1000 }}>
      <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0, color: T.accent }}>Results brief</h1>
      <p style={{ fontSize: "0.9rem", color: T.inkSoft, margin: "0.5rem 0 1.2rem 0", lineHeight: 1.6, maxWidth: "70ch" }}>
        What a quarter changed: against the previous quarter, the same quarter last year, the trailing twelve months and the peers that have reported. Every figure is
        a subtraction or ratio of imported lines. Quarterly results carry the profit and loss only; the balance sheet comes half-yearly.
      </p>

      <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap", marginBottom: "1.2rem" }}>
        <span style={{ fontSize: "0.9rem" }}><strong>{ws.company_name}</strong> <span style={{ color: T.inkSoft }}>({workspaceOptionLabel(ws, userId)})</span></span>
        {quarters.length > 0 && (
          <label style={{ fontSize: "0.82rem", color: T.inkSoft, display: "flex", gap: 8, alignItems: "center" }}>
            Quarter
            <select aria-label="Quarter" value={end} onChange={(e) => setQuarter(e.target.value)} style={{ fontFamily: "inherit", fontSize: "0.86rem", padding: "0.3rem 0.5rem", border: `1px solid ${T.rule}`, borderRadius: 3, background: T.card, color: T.ink }}>
              {quarters.map((q) => <option key={q.end} value={q.end}>{q.label}</option>)}
            </select>
          </label>
        )}
      </div>

      {!brief ? (
        <div style={card} data-testid="results-empty">
          <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.6 }}>
            {ws.company_name} has no quarterly results on file. Add one with <Link href={`/sentinel/projects/${ws.id}/import`} style={{ color: T.accent }}>Import files</Link> (a quarterly results PDF or CSV) or
            under <Link href={`/sentinel/add-period?workspace=${ws.id}`} style={{ color: T.accent }}>Edit periods</Link> with a quarter as the period type. Having the previous quarter and the same quarter last year on file turns on the comparisons.
          </p>
        </div>
      ) : (
        <>
          <section style={card} aria-label="This quarter" data-testid="results-table">
            <h2 style={h2}>{brief.company_name} - {brief.period_label} <span style={{ fontSize: "0.8rem", color: T.inkSoft, fontFamily: "inherit" }}>({brief.basis}, ₹ crore)</span></h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: "left" }}>Line</th><th style={th}>{brief.period_label}</th>
                    <th style={th}>{brief.prior_quarter_label ?? "Previous quarter"}</th><th style={th}>QoQ</th>
                    <th style={th}>{brief.prior_year_label ?? "Last year"}</th><th style={th}>YoY</th>
                  </tr>
                </thead>
                <tbody>
                  {brief.lines.map((l) => (
                    <tr key={l.key}>
                      <td style={{ ...td, textAlign: "left", fontWeight: 500 }}>{l.label}</td>
                      <td style={td}>{show(l, l.current)}</td><td style={td}>{show(l, l.prior_quarter)}</td><td style={td}>{delta(l, l.qoq)}</td>
                      <td style={td}>{show(l, l.prior_year)}</td><td style={td}>{delta(l, l.yoy)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {brief.notes.map((n, i) => <p key={i} style={{ fontSize: "0.8rem", color: T.inkSoft, margin: "0.6rem 0 0 0" }}>{n}</p>)}
          </section>

          <section style={card} aria-label="Trailing twelve months" data-testid="results-ttm">
            <h2 style={h2}>Trailing twelve months</h2>
            {"ttm" in brief.ttm ? (
              <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.7 }}>
                Revenue <strong>{amount(brief.ttm.ttm.revenue)}</strong> cr, EBITDA <strong>{amount(brief.ttm.ttm.ebitda)}</strong> cr ({pct(brief.ttm.ttm.ebitda_margin)}), profit after tax <strong>{amount(brief.ttm.ttm.pat)}</strong> cr ({pct(brief.ttm.ttm.pat_margin)}).
                <span style={{ color: T.inkSoft }}> {brief.ttm.ttm.basis === "financial year" ? "The audited year closes at this quarter." : `Sum of ${brief.ttm.ttm.labels.join(", ")}.`}</span>
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: "0.9rem", color: T.inkSoft }}>Not available: add {brief.ttm.missing.join(" and ")} to total the last four quarters.</p>
            )}
          </section>

          <section style={card} aria-label="What stands out" data-testid="results-flags">
            <h2 style={h2}>What stands out</h2>
            {brief.flags.length === 0 ? (
              <p style={{ margin: 0, fontSize: "0.9rem", color: T.inkSoft }}>Nothing crosses a threshold this quarter. The thresholds are starting assumptions, not calibrated against filings.</p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {brief.flags.map((f, i) => (
                  <li key={f.id} style={{ padding: "0.6rem 0", borderTop: i ? `1px solid ${T.rule}` : "none" }}>
                    <div style={{ fontWeight: 500, fontSize: "0.92rem" }}>{f.title}</div>
                    <div style={{ fontSize: "0.82rem", color: T.inkSoft, lineHeight: 1.5 }}>{f.detail}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={card} aria-label="Against estimates" data-testid="results-variance">
            <h2 style={h2}>Against estimates</h2>
            {variance.length === 0 ? (
              <p style={{ margin: 0, fontSize: "0.9rem", color: T.inkSoft }}>No estimates are stored for the quarter ended {brief.period_end_date}. Add them below and the beat or miss appears here.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                  <thead><tr><th style={{ ...th, textAlign: "left" }}>Line (₹ crore)</th><th style={th}>Actual</th><th style={{ ...th, textAlign: "left" }}>Estimate</th><th style={th}>Estimate value</th><th style={th}>Variance</th><th style={th}>Call</th></tr></thead>
                  <tbody>
                    {variance.flatMap((row) => row.estimates.map((e, i) => (
                      <tr key={`${row.metric}-${e.source}`}>
                        <td style={{ ...td, textAlign: "left", fontWeight: 500 }}>{i === 0 ? row.label : ""}</td>
                        <td style={td}>{i === 0 ? amount(row.actual) : ""}</td>
                        <td style={{ ...td, textAlign: "left" }}>{e.source === "own" ? "My estimate" : "Consensus"}{e.source_label ? ` (${e.source_label})` : ""}</td>
                        <td style={td}>{amount(e.value)}</td><td style={td}>{signed(e.variance)}</td>
                        <td style={td}>{e.call && <span style={{ fontSize: "0.74rem", fontWeight: 600, padding: "0.15rem 0.55rem", borderRadius: 2, background: CALL[e.call].bg, color: CALL[e.call].fg }}>{CALL[e.call].text}</span>}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            )}
            <p style={{ fontSize: "0.76rem", color: T.inkSoft, margin: "0.6rem 0 0 0" }}>In line means within 1% on revenue, 2% on EBITDA and 3% on profit before and after tax (starting assumptions).</p>
          </section>

          <section style={card} aria-label="Peers" data-testid="results-peers">
            <h2 style={h2}>Against peers that have reported {brief.period_label}</h2>
            {brief.peers.reported.length === 0 ? (
              <p style={{ margin: 0, fontSize: "0.9rem", color: T.inkSoft }}>No peer in this sector has reported the quarter ended {brief.period_end_date} yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
                  <thead>
                    <tr><th style={{ ...th, textAlign: "left" }}>Company</th><th style={th}>Revenue YoY</th><th style={th}>Revenue QoQ</th><th style={th}>EBITDA margin</th><th style={th}>Margin YoY</th><th style={th}>PAT margin</th><th style={th}>PAT YoY</th></tr>
                  </thead>
                  <tbody>
                    <tr style={{ background: "rgba(0,33,71,0.05)" }}>
                      <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{brief.company_name}</td>
                      <td style={td}>{signed(brief.lines[0].yoy)}</td><td style={td}>{signed(brief.lines[0].qoq)}</td><td style={td}>{pct(brief.lines[2].current)}</td>
                      <td style={td}>{bps(brief.lines[2].yoy)}</td><td style={td}>{pct(brief.lines[6].current)}</td><td style={td}>{signed(brief.lines[5].yoy)}</td>
                    </tr>
                    {brief.peers.reported.map((p) => (
                      <tr key={p.workspace_id}>
                        <td style={{ ...td, textAlign: "left" }}>{p.company_name} <span style={{ color: T.inkSoft, fontSize: "0.74rem" }}>({p.basis})</span></td>
                        <td style={td}>{signed(p.revenue_yoy)}</td><td style={td}>{signed(p.revenue_qoq)}</td><td style={td}>{pct(p.ebitda_margin)}</td>
                        <td style={td}>{bps(p.ebitda_margin_yoy)}</td><td style={td}>{pct(p.pat_margin)}</td><td style={td}>{signed(p.pat_yoy)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ ...td, textAlign: "left", color: T.inkSoft }}>Peer median</td>
                      <td style={td}>{signed(brief.peers.median.revenue_yoy)}</td><td style={td}>-</td><td style={td}>{pct(brief.peers.median.ebitda_margin)}</td><td style={td}>-</td><td style={td}>{pct(brief.peers.median.pat_margin)}</td><td style={td}>-</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {brief.peers.not_reported.length > 0 && <p style={{ fontSize: "0.8rem", color: T.inkSoft, margin: "0.6rem 0 0 0" }}>Not yet reported (or not imported): {brief.peers.not_reported.join(", ")}.</p>}
          </section>
        </>
      )}

      <section style={card} aria-label="Estimates">
        <h2 style={h2}>Estimates</h2>
        <p style={{ fontSize: "0.82rem", color: T.inkSoft, margin: "0 0 0.8rem 0", lineHeight: 1.5 }}>What was expected, in rupees crore. Enter it before the result, or paste a consensus. Sentinel has no consensus feed; these are your numbers, visible only to you.</p>
        <EstimatesPanel workspaceId={ws.id} fyStartMonth={ws.fiscal_year_start_month || 4} defaultPeriodEnd={defaultPeriod} estimates={estimates} setUp={estimatesSetUp} reportedEnds={reportedEnds} onChange={() => setEstimatesTick((n) => n + 1)} />
      </section>
    </div>
  );
}
