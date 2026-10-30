"use client";
export const dynamic = "force-dynamic";

// Sentinel - the results calendar: which of your listed companies report next, and what is still to import. See lib/resultsCalendar.ts.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { useShell } from "../lib/shell/ShellData";
import { buildResultsCalendar, describeRow, STATUS_TEXT, type ResultsStatus } from "../lib/resultsCalendar";
import { SERIF, T } from "../lib/theme";
import type { FinancialStatement } from "../lib/types";

const CHIP: Record<ResultsStatus, { bg: string; fg: string }> = {
  filed: { bg: "rgba(11,107,95,0.12)", fg: "#0b6b5f" },
  open: { bg: "rgba(0,0,0,0.06)", fg: T.inkSoft },
  due_soon: { bg: "rgba(164,90,7,0.14)", fg: "#8a4b05" },
  overdue: { bg: "rgba(140,30,30,0.14)", fg: T.oxblood },
};

export default function CalendarPage() {
  const router = useRouter();
  const { workspaces, userId, loading: shellLoading, signedIn } = useShell();
  const [loaded, setLoaded] = useState(false);
  const [statements, setStatements] = useState<FinancialStatement[]>([]);

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

  const today = new Date().toISOString().slice(0, 10);
  const rows = useMemo(() => buildResultsCalendar(workspaces, statements, today, userId), [workspaces, statements, today, userId]);
  const unlisted = workspaces.filter((w) => w.owner_id === userId && !w.is_public_reference && !w.ticker && !w.bse_code);

  if (shellLoading || !loaded) return <p style={{ color: T.inkSoft }}>Building the calendar...</p>;
  const th: React.CSSProperties = { textAlign: "left", fontSize: "0.7rem", letterSpacing: "0.08em", textTransform: "uppercase", color: T.inkSoft, fontWeight: 500, padding: "0.5rem 0.7rem", borderBottom: `1px solid ${T.rule}` };
  const td: React.CSSProperties = { fontSize: "0.88rem", padding: "0.65rem 0.7rem", borderBottom: `1px solid ${T.rule}`, verticalAlign: "top" };

  return (
    <div style={{ maxWidth: 980 }}>
      <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0, color: T.accent }}>Results calendar</h1>
      <p style={{ fontSize: "0.9rem", color: T.inkSoft, margin: "0.5rem 0 1.4rem 0", lineHeight: 1.6, maxWidth: "68ch" }}>
        A listed company must report each quarter within 45 days of the quarter end, and the audited year within 60 days. The date shown is that last day, not the
        company&apos;s announced date. Sentinel can only tell you whether the figures are imported here, not whether the company has filed.
      </p>
      {rows.length === 0 ? (
        <p data-testid="calendar-empty" style={{ fontSize: "0.9rem", color: T.inkSoft }}>
          No listed companies yet. Add an NSE symbol or a BSE code under a project&apos;s Settings, Market data, and it appears here.
        </p>
      ) : (
        <div style={{ overflowX: "auto", background: T.card, border: `1px solid ${T.rule}`, borderRadius: 3 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }} data-testid="calendar-table">
            <thead>
              <tr><th style={th}>Company</th><th style={th}>Period</th><th style={th}>Deadline</th><th style={th}>Status</th><th style={th}>Next after that</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.workspace_id} data-status={r.status}>
                  <td style={td}><Link href={`/sentinel/projects/${r.workspace_id}/import`} style={{ color: T.accent, fontWeight: 500, textDecoration: "none" }}>{r.company_name}</Link>
                    <div style={{ fontSize: "0.76rem", color: T.inkSoft }}>Latest on file: {r.latest_on_file ?? "nothing yet"}</div></td>
                  <td style={td}>{r.period_label}<div style={{ fontSize: "0.76rem", color: T.inkSoft }}>ended {r.period_end_date}{r.year_end ? ", with the audited year" : ""}</div></td>
                  <td style={td}>{r.due_date}<div style={{ fontSize: "0.76rem", color: T.inkSoft }}>{r.status === "filed" ? "" : r.days_left >= 0 ? `${r.days_left} day${r.days_left === 1 ? "" : "s"} left` : `${-r.days_left} day${r.days_left === -1 ? "" : "s"} past`}</div></td>
                  <td style={td}>
                    <span style={{ display: "inline-block", fontSize: "0.74rem", fontWeight: 600, padding: "0.15rem 0.55rem", borderRadius: 2, background: CHIP[r.status].bg, color: CHIP[r.status].fg }}>{STATUS_TEXT[r.status]}</span>
                    <div style={{ fontSize: "0.76rem", color: T.inkSoft, marginTop: 4, maxWidth: "34ch", lineHeight: 1.45 }}>{describeRow(r)}</div>
                  </td>
                  <td style={td}>{r.next.period_label}<div style={{ fontSize: "0.76rem", color: T.inkSoft }}>by {r.next.due_date}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {unlisted.length > 0 && (
        <p style={{ fontSize: "0.82rem", color: T.inkSoft, marginTop: "1rem" }}>
          Not on the calendar (no NSE symbol or BSE code): {unlisted.map((w) => w.company_name).join(", ")}.
        </p>
      )}
    </div>
  );
}
