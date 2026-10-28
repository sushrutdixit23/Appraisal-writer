"use client";
export const dynamic = "force-dynamic";

// Sentinel - does the confidence score mean anything? It is compared with what reviewers actually did with the
// investigations (kept or rejected), bucket by bucket, with an honest interval - and it says plainly when there are
// too few decisions to conclude anything. Also the measured AI cost of the drafts so far. See evaluation/confidenceCalibration.ts.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { calibrationReport, type DecidedInvestigation } from "../lib/evaluation/confidenceCalibration";
import { useShell } from "../lib/shell/ShellData";
import { SERIF, T } from "../lib/theme";

type Row = DecidedInvestigation & { generation_usage?: { estimated_cost_usd: number | null; total: { input_tokens: number; output_tokens: number } } | null };

const pct = (v: number | null) => (v == null ? "-" : `${(v * 100).toFixed(0)}%`);
const cell: React.CSSProperties = { padding: "0.45rem 0.6rem", textAlign: "left", fontSize: "0.85rem", borderTop: `1px solid ${T.rule}` };
/** Below this many decisions the rates are noise; the page says so rather than implying a verdict. */
const ENOUGH = 20;

export default function CalibrationPage() {
  const router = useRouter();
  const { loading: shellLoading, signedIn } = useShell();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (shellLoading) return;
    if (!signedIn) { router.push("/login"); return; }
    (async () => {
      // generation_usage exists only after its migration; fall back to the two columns the report needs.
      const full = await supabase.from("sentinel_investigations").select("confidence_score,status,generation_usage");
      if (!full.error) { setRows((full.data ?? []) as Row[]); return; }
      const basic = await supabase.from("sentinel_investigations").select("confidence_score,status");
      setRows((basic.data ?? []) as Row[]);
    })();
  }, [shellLoading, signedIn, router]);

  const report = useMemo(() => (rows ? calibrationReport(rows) : null), [rows]);
  const cost = useMemo(() => {
    const priced = (rows ?? []).filter((r) => r.generation_usage?.estimated_cost_usd != null);
    const total = priced.reduce((n, r) => n + (r.generation_usage!.estimated_cost_usd ?? 0), 0);
    return { n: priced.length, total, avg: priced.length ? total / priced.length : null };
  }, [rows]);

  if (shellLoading || !report) return <p style={{ color: T.inkSoft }}>Loading...</p>;

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0, color: T.accent }}>Confidence calibration</h1>
      <p style={{ fontSize: "0.9rem", color: T.inkSoft, margin: "0.5rem 0 1.4rem 0", lineHeight: 1.6 }}>
        The confidence score is computed from evidence, never stated by the AI. This checks it against what reviewers did: a higher score should mean
        the finding is kept more often. Approved and edited count as kept; rejected as not.
      </p>
      <section style={{ background: T.card, border: `1px solid ${T.rule}`, borderRadius: 3, padding: "1rem 1.3rem", marginBottom: "1rem" }} data-testid="calibration-summary">
        <p style={{ margin: 0, fontSize: "0.92rem" }}>
          <strong>{report.n_decided}</strong> decided investigations, <strong>{pct(report.overall_approved_rate)}</strong> kept overall.
          {report.monotonic === true && " Higher confidence has meant kept more often so far."}
          {report.monotonic === false && " Higher confidence has NOT meant kept more often - the score is not tracking reviewer decisions."}
        </p>
        {report.n_decided < ENOUGH && (
          <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.82rem", color: T.ochre }} data-testid="calibration-caveat">
            Only {report.n_decided} decision{report.n_decided === 1 ? "" : "s"} so far. Below about {ENOUGH} these rates are noise, so treat this as the instrument warming up, not a verdict.
          </p>
        )}
      </section>
      <table style={{ width: "100%", borderCollapse: "collapse", background: T.card, border: `1px solid ${T.rule}`, borderRadius: 3 }}>
        <thead>
          <tr>{["Confidence", "Decided", "Kept", "Kept rate", "95% interval"].map((h) => <th key={h} style={{ ...cell, borderTop: "none", fontWeight: 600, color: T.inkSoft, fontSize: "0.74rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {report.buckets.map((b) => (
            <tr key={b.label}>
              <td style={cell}>{b.label}</td><td style={cell}>{b.n}</td><td style={cell}>{b.approved}</td><td style={cell}>{pct(b.approved_rate)}</td>
              <td style={cell}>{b.approved_rate_ci95 ? `${pct(b.approved_rate_ci95[0])} to ${pct(b.approved_rate_ci95[1])}` : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <section style={{ background: T.card, border: `1px solid ${T.rule}`, borderRadius: 3, padding: "1rem 1.3rem", marginTop: "1rem" }} data-testid="calibration-cost">
        <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.1rem", margin: "0 0 0.4rem 0" }}>What the drafts cost</h2>
        {cost.n === 0 ? (
          <p style={{ margin: 0, fontSize: "0.85rem", color: T.inkSoft }}>No cost recorded yet. It is measured from the API&apos;s own token counts on each draft generated after the usage migration is run.</p>
        ) : (
          <p style={{ margin: 0, fontSize: "0.88rem" }}>
            {cost.n} draft{cost.n > 1 ? "s" : ""}: about <strong>${cost.total.toFixed(3)}</strong> in total, <strong>${(cost.avg ?? 0).toFixed(4)}</strong> each (an estimate from published prices).
          </p>
        )}
      </section>
    </div>
  );
}
