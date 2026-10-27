"use client";
export const dynamic = "force-dynamic";

// Sentinel - a project's Overview. Where a company opens: what it is, how it stands, and - for a project you own
// that is not finished - the next thing to do. Everything here is read from the same rows the other pages use.
//
// An empty project is a normal state: it shows two ways to start (import a file, or type the figures) and the
// checklist, not an error. A reference company shows the same figures without the setup steps or the edit links.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useDisplayUnit } from "../../lib/displayUnit";
import { computeRatios, findPriorYear } from "../../lib/engine";
import { OperatingMetrics } from "../../lib/shell/OperatingMetrics";
import { ChangeHistory } from "../../lib/shell/ChangeHistory";
import { setupChecklist } from "../../lib/shell/nav";
import { useShell } from "../../lib/shell/ShellData";
import { HEALTH_STYLE, summarise } from "../../lib/shell/summary";
import { makeDelta } from "../../lib/viz/delta";
import { StatTile } from "../../lib/viz/StatTile";
import { SERIF, T } from "../../lib/theme";
import { unitLabel } from "../../lib/units";
import type { FinancialStatement } from "../../lib/types";

const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.rule}`, borderRadius: 3, padding: "1.2rem 1.4rem" };
const eyebrow: React.CSSProperties = { fontSize: "0.68rem", fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: T.inkSoft, margin: 0 };
const btn: React.CSSProperties = {
  display: "inline-block", fontFamily: "inherit", fontSize: "0.85rem", fontWeight: 500, padding: "0.5rem 1.1rem", border: `1px solid ${T.accent}`, borderRadius: 3,
  background: T.accent, color: T.background, textDecoration: "none", cursor: "pointer",
};
const btnGhost: React.CSSProperties = { ...btn, background: "transparent", color: T.ink };

const fmt = (v: number | null | undefined, digits = 0) =>
  v == null ? "—" : v.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

export default function ProjectOverviewPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const du = useDisplayUnit();
  const { workspaces, userId, loading: shellLoading, signedIn } = useShell();
  const workspace = workspaces.find((w) => w.id === id) ?? null;
  const canWrite = !!workspace && workspace.owner_id === userId;

  const [statements, setStatements] = useState<FinancialStatement[]>([]);
  const [investigations, setInvestigations] = useState<{ workspace_id: string; status: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (shellLoading) return;
    if (!signedIn) {
      router.push("/login");
      return;
    }
    if (!workspace) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const [s, i] = await Promise.all([
        supabase.from("sentinel_statements").select("*").eq("workspace_id", id).order("period_end_date", { ascending: false }),
        supabase.from("sentinel_investigations").select("workspace_id,status").eq("workspace_id", id),
      ]);
      if (cancelled) return;
      if (s.error) setError(s.error.message);
      setStatements((s.data ?? []) as FinancialStatement[]);
      setInvestigations((i.data ?? []) as { workspace_id: string; status: string }[]);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [shellLoading, signedIn, workspace?.id, id, router]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = useMemo(() => (workspace ? summarise(workspace, statements, investigations) : null), [workspace, statements, investigations]);
  const steps = useMemo(() => setupChecklist({ projectId: id, statements, investigations }), [id, statements, investigations]);

  if (shellLoading || !loaded) return <p style={{ color: T.inkSoft }}>Loading project...</p>;

  if (!workspace || !summary) {
    return (
      <div style={{ maxWidth: 560 }}>
        <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0 }}>Project not found</h1>
        <p style={{ fontSize: "0.9rem", color: T.inkSoft, lineHeight: 1.6, margin: "0.8rem 0 1.2rem 0" }}>
          This project does not exist, or it belongs to someone else. Open one of your own from the list.
        </p>
        <Link href="/sentinel/projects" style={btn}>All projects</Link>
      </div>
    );
  }

  const { latest, prior, health } = summary;
  let ratios: Record<string, number | null> | null = null;
  if (latest) {
    try {
      ratios = computeRatios(latest, prior ?? findPriorYear(latest, statements), workspace.sector);
    } catch {
      ratios = null; // a sector with no configuration: show the figures, not the ratios
    }
  }
  const own = (v: number | null | undefined) => (v == null ? null : du.fromCompany(v, workspace.currency_unit));
  const done = steps.filter((s) => s.done).length;
  const nextStep = steps.find((s) => !s.done) ?? null;
  const showSetup = canWrite && done < steps.length;
  const empty = statements.length === 0;
  const h = health ? HEALTH_STYLE[health.overall] : null;
  const annual = statements.filter((s) => s.period_type === "FY");
  const w = `?workspace=${id}`;

  // The company's own basis, oldest first: the shape of each figure over the years, for the sparklines.
  const sameBasis = latest ? annual.filter((st) => st.basis === latest.basis).sort((x, y) => x.period_end_date.localeCompare(y.period_end_date)) : [];
  const priorMargin = prior && prior.ebitda != null && prior.revenue_from_operations ? prior.ebitda / prior.revenue_from_operations : null;
  const vs = prior?.period_label;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap", marginBottom: "1.6rem" }}>
        <div>
          <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0 }}>{workspace.company_name}</h1>
          <p style={{ fontSize: "0.8rem", color: T.inkSoft, margin: "0.4rem 0 0 0" }}>
            {canWrite ? "Your project" : "Reference company, read-only"} - {workspace.sector}
            {workspace.industry ? ` - ${workspace.industry}` : ""} - reports in {unitLabel(workspace.currency_unit)} - compared {workspace.comparison_basis}
          </p>
        </div>
        {canWrite && (
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            <Link href={`/sentinel/data-entry${w}`} style={btn}>Add period</Link>
            <Link href={`/sentinel/projects/${id}/import`} style={btnGhost}>Import files</Link>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" style={{ fontSize: "0.85rem", background: T.accentSoft, borderLeft: `2px solid ${T.accent}`, padding: "0.6rem 0.9rem", marginBottom: "1.2rem" }}>
          Could not load every figure: {error}
        </p>
      )}

      {empty && (
        <section aria-label="Start here" style={{ marginBottom: "1.8rem" }} data-testid="start-here">
          {canWrite ? (
            <>
              <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.25rem", margin: "0 0 0.3rem 0" }}>Start with the figures</h2>
              <p style={{ fontSize: "0.86rem", color: T.inkSoft, margin: "0 0 1rem 0", lineHeight: 1.55 }}>
                This project has no periods yet. Sentinel reads a text PDF, a CSV or an Excel file by rules (no AI) and shows the line each figure came from.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
                <Link href={`/sentinel/projects/${id}/import`} style={{ ...card, textDecoration: "none", color: T.ink }}>
                  <p style={{ fontFamily: SERIF, fontSize: "1.1rem", fontWeight: 500, margin: 0 }}>Import a file</p>
                  <p style={{ fontSize: "0.82rem", color: T.inkSoft, margin: "0.4rem 0 0 0", lineHeight: 1.5 }}>
                    An annual report or results PDF, or a sheet with several years. Every period it finds is previewed before anything is saved.
                  </p>
                </Link>
                <Link href={`/sentinel/data-entry${w}`} style={{ ...card, textDecoration: "none", color: T.ink }}>
                  <p style={{ fontFamily: SERIF, fontSize: "1.1rem", fontWeight: 500, margin: 0 }}>Type the figures</p>
                  <p style={{ fontSize: "0.82rem", color: T.inkSoft, margin: "0.4rem 0 0 0", lineHeight: 1.5 }}>
                    One period at a time, with the same checks. You can also fill the form from a file and correct it by hand.
                  </p>
                </Link>
              </div>
            </>
          ) : (
            <p style={{ fontSize: "0.9rem", color: T.inkSoft }}>This reference company has no periods on file.</p>
          )}
        </section>
      )}

      {!empty && (
        <section aria-label="Key figures" style={{ marginBottom: "1.8rem" }}>
          <p style={{ ...eyebrow, marginBottom: "0.6rem" }}>
            {latest ? `${latest.period_label} (${latest.basis}) - ${du.ownLabel(workspace.currency_unit)}` : "No annual statement yet"}
          </p>
          {latest ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", borderTop: `1px solid ${T.ink}`, borderBottom: `1px solid ${T.rule}` }}>
              <StatTile ledger index={0} label="Revenue" value={fmt(own(latest.revenue_from_operations))} delta={makeDelta("amount", "higher", latest.revenue_from_operations, prior?.revenue_from_operations ?? null, vs)} spark={sameBasis.map((st) => own(st.revenue_from_operations))} sparkTitle="Revenue across the years on file" />
              <StatTile ledger index={1} label="Profit after tax" value={fmt(own(latest.profit_after_tax))} note={ratios?.["pat_margin"] != null ? `${pct(ratios["pat_margin"])} of revenue` : null} delta={makeDelta("amount", "higher", latest.profit_after_tax, prior?.profit_after_tax ?? null, vs)} spark={sameBasis.map((st) => own(st.profit_after_tax))} sparkTitle="Profit after tax across the years on file" />
              <StatTile ledger index={2} label="EBITDA margin" value={pct(ratios?.["ebitda_margin"])} delta={makeDelta("percent", "higher", ratios?.["ebitda_margin"] ?? null, priorMargin, vs)} spark={sameBasis.map((st) => (st.ebitda != null && st.revenue_from_operations ? st.ebitda / st.revenue_from_operations : null))} sparkTitle="EBITDA margin across the years on file" />
              <StatTile ledger index={3} label="Health" value={h ? h.label : "No data"} note={h ? `${health!.categories.filter((c) => c.status !== "no_data").length} of ${health!.categories.length} checks have data` : null} />
            </div>
          ) : (
            <p style={{ fontSize: "0.86rem", color: T.inkSoft }}>
              Only quarterly figures are on file. The KPIs, health score and peer comparison are built from annual statements.
            </p>
          )}
        </section>
      )}

      {showSetup && (
        <section aria-label="Setup" style={{ ...card, marginBottom: "1.8rem" }} data-testid="setup-checklist">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
            <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.15rem", margin: 0 }}>Set up this project</h2>
            <p style={{ fontSize: "0.78rem", color: T.inkSoft, margin: 0 }} role="status">{done} of {steps.length} done</p>
          </div>
          <div
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={done}
            style={{ height: 4, background: T.rule, borderRadius: 2, margin: "0.7rem 0 0.4rem 0", overflow: "hidden" }}
          >
            <div style={{ width: `${(done / steps.length) * 100}%`, height: "100%", background: T.accent }} />
          </div>
          <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {steps.map((s) => (
              <li key={s.id} style={{ display: "flex", gap: "0.8rem", padding: "0.7rem 0", borderTop: `1px solid ${T.rule}`, alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2, borderRadius: "50%", border: `1.5px solid ${s.done ? T.accent : T.rule}`, background: s.done ? T.accent : "transparent", color: T.card, fontSize: "0.7rem", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  {s.done ? "✓" : ""}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600, color: s.done ? T.inkSoft : T.ink }}>
                    {s.title}
                    <span style={{ position: "absolute", left: -9999 }}>{s.done ? " - done" : " - to do"}</span>
                  </p>
                  {!s.done && <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.8rem", color: T.inkSoft, lineHeight: 1.5 }}>{s.detail}</p>}
                </div>
                {!s.done && s.href && s.cta && (
                  <Link href={s.href} style={s === nextStep ? { ...btn, padding: "0.35rem 0.9rem", fontSize: "0.8rem" } : { ...btnGhost, padding: "0.35rem 0.9rem", fontSize: "0.8rem" }}>
                    {s.cta}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {health && health.categories.length > 0 && (
        <section aria-label="Health checks" style={{ marginBottom: "1.8rem" }}>
          <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.15rem", margin: "0 0 0.6rem 0" }}>Health checks</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.8rem" }}>
            {health.categories.map((c) => {
              const s = HEALTH_STYLE[c.status];
              return (
                <div key={c.key} style={{ ...card, padding: "0.8rem 1rem" }}>
                  <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600 }}>
                    {c.label} <span style={{ color: s.color, fontWeight: 600, marginLeft: 6 }}>{s.label}</span>
                  </p>
                  <p style={{ margin: "0.3rem 0 0 0", fontSize: "0.78rem", color: T.inkSoft, lineHeight: 1.5 }}>
                    {c.detail ?? (c.status === "no_data" ? "Needs figures this project does not have yet." : "")}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!empty && (
        <section aria-label="Periods" style={{ marginBottom: "1.8rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.6rem" }}>
            <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.15rem", margin: 0 }}>Periods on file</h2>
            <Link href={`/sentinel/statements${w}`} style={{ fontSize: "0.8rem", color: T.accent }}>Open the comparative statements</Link>
          </div>
          <div style={{ ...card, padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
              <caption style={{ position: "absolute", left: -9999 }}>Periods on file for {workspace.company_name}</caption>
              <thead>
                <tr style={{ textAlign: "left", color: T.inkSoft, fontSize: "0.7rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  <th scope="col" style={{ padding: "0.6rem 1rem", fontWeight: 600 }}>Period</th>
                  <th scope="col" style={{ padding: "0.6rem 1rem", fontWeight: 600 }}>Basis</th>
                  <th scope="col" style={{ padding: "0.6rem 1rem", fontWeight: 600 }}>Ends</th>
                  <th scope="col" style={{ padding: "0.6rem 1rem", fontWeight: 600, textAlign: "right" }}>Revenue</th>
                  <th scope="col" style={{ padding: "0.6rem 1rem", fontWeight: 600, textAlign: "right" }}>Profit after tax</th>
                  <th scope="col" style={{ padding: "0.6rem 1rem", fontWeight: 600 }}>Source</th>
                  {canWrite && <th scope="col" style={{ padding: "0.6rem 1rem" }}><span style={{ position: "absolute", left: -9999 }}>Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {statements.map((s) => (
                  <tr key={s.id ?? `${s.period_label}-${s.basis}`} style={{ borderTop: `1px solid ${T.rule}` }}>
                    <th scope="row" style={{ padding: "0.6rem 1rem", textAlign: "left", fontWeight: 600 }}>
                      {s.period_label} <span style={{ color: T.inkSoft, fontWeight: 400, fontSize: "0.74rem" }}>{s.period_type}</span>
                    </th>
                    <td style={{ padding: "0.6rem 1rem", color: T.inkSoft }}>{s.basis}</td>
                    <td style={{ padding: "0.6rem 1rem", color: T.inkSoft, fontVariantNumeric: "tabular-nums" }}>{s.period_end_date}</td>
                    <td style={{ padding: "0.6rem 1rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(own(s.revenue_from_operations), 1)}</td>
                    <td style={{ padding: "0.6rem 1rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(own(s.profit_after_tax), 1)}</td>
                    <td style={{ padding: "0.6rem 1rem", color: T.inkSoft, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.source_file}>
                      {s.source_file}
                    </td>
                    {canWrite && (
                      <td style={{ padding: "0.6rem 1rem", textAlign: "right", whiteSpace: "nowrap" }}>
                        <Link
                          href={`/sentinel/add-period${w}&statement=${s.id}`}
                          style={{ color: T.accent, fontSize: "0.8rem" }}
                          aria-label={`Edit ${s.period_label} ${s.basis}`}
                        >
                          Edit
                        </Link>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {annual.length === 0 && <p style={{ fontSize: "0.78rem", color: T.inkSoft, marginTop: "0.5rem" }}>No annual (FY) statement yet, so the KPIs and peer comparison are empty.</p>}
        </section>
      )}

      <OperatingMetrics workspaceId={workspace.id} canWrite={canWrite} />

      {canWrite && <ChangeHistory workspaceId={workspace.id} />}

      <section aria-label="Open" style={{ display: "flex", gap: "0.7rem", flexWrap: "wrap" }}>
        <Link href={`/sentinel/kpi${w}`} style={btnGhost}>KPIs</Link>
        <Link href={`/sentinel/analysis${w}`} style={btnGhost}>Peers and trends</Link>
        <Link href={`/sentinel${w}`} style={btnGhost}>
          Investigations{summary.pending > 0 ? ` (${summary.pending} pending)` : ""}
        </Link>
      </section>
    </div>
  );
}
