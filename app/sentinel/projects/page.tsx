"use client";
export const dynamic = "force-dynamic";

// Sentinel - Projects. Every company you can open, as cards: its latest year, its health and what is waiting for
// you. Your own projects first (with a "New project" card), then the read-only reference companies.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { useDisplayUnit } from "../lib/displayUnit";
import { HEALTH_STYLE, summarise } from "../lib/shell/summary";
import { useShell } from "../lib/shell/ShellData";
import { SERIF, T } from "../lib/theme";
import { unitLabel } from "../lib/units";
import type { FinancialStatement } from "../lib/types";

const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.rule}`, borderRadius: 3, padding: "1.1rem 1.25rem", textDecoration: "none", color: T.ink, display: "block" };

export default function ProjectsPage() {
  const router = useRouter();
  const du = useDisplayUnit();
  const { workspaces, userId, loading: shellLoading, signedIn } = useShell();
  const [statements, setStatements] = useState<FinancialStatement[]>([]);
  const [investigations, setInvestigations] = useState<{ workspace_id: string; status: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (shellLoading) return;
    if (!signedIn) {
      router.push("/login");
      return;
    }
    (async () => {
      const ids = workspaces.map((w) => w.id);
      if (ids.length > 0) {
        const [s, i] = await Promise.all([
          supabase.from("sentinel_statements").select("*").in("workspace_id", ids),
          supabase.from("sentinel_investigations").select("workspace_id,status"),
        ]);
        setStatements((s.data ?? []) as FinancialStatement[]);
        setInvestigations((i.data ?? []) as { workspace_id: string; status: string }[]);
      }
      setLoaded(true);
    })();
  }, [shellLoading, signedIn, workspaces, router]);

  const q = query.trim().toLowerCase();
  const match = (name: string, sector: string) => !q || name.toLowerCase().includes(q) || sector.toLowerCase().includes(q);
  const mine = useMemo(() => workspaces.filter((w) => w.owner_id === userId && match(w.company_name, w.sector)), [workspaces, userId, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const reference = useMemo(() => workspaces.filter((w) => w.owner_id !== userId && match(w.company_name, w.sector)), [workspaces, userId, q]); // eslint-disable-line react-hooks/exhaustive-deps

  if (shellLoading || !loaded) return <p style={{ color: T.inkSoft }}>Loading Sentinel...</p>;

  function ProjectCard({ id }: { id: string }) {
    const ws = workspaces.find((w) => w.id === id)!;
    const s = summarise(ws, statements, investigations);
    const own = ws.owner_id === userId;
    const h = s.health ? HEALTH_STYLE[s.health.overall] : null;
    return (
      <Link href={`/sentinel/projects/${ws.id}`} style={card} data-testid="project-card" aria-label={`Open ${ws.company_name}`}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.6rem" }}>
          <p style={{ fontFamily: SERIF, fontSize: "1.1rem", fontWeight: 500, margin: 0, lineHeight: 1.25 }}>{ws.company_name}</p>
          {!own && <span style={{ fontSize: "0.62rem", letterSpacing: "0.06em", textTransform: "uppercase", color: T.inkSoft, border: `1px solid ${T.rule}`, padding: "0.1rem 0.4rem", whiteSpace: "nowrap" }}>Reference</span>}
        </div>
        <p style={{ fontSize: "0.74rem", color: T.inkSoft, margin: "0.3rem 0 0.9rem 0" }}>
          {ws.sector} - {unitLabel(ws.currency_unit)} - {ws.comparison_basis}
        </p>
        {s.latest ? (
          <p style={{ fontSize: "0.9rem", margin: "0 0 0.7rem 0" }}>
            <span style={{ color: T.inkSoft }}>{s.latest.period_label} revenue </span>
            <strong>{du.fromCompany(s.latest.revenue_from_operations, ws.currency_unit).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</strong>
            <span style={{ color: T.inkSoft, fontSize: "0.74rem" }}> {du.ownShort(ws.currency_unit)}</span>
          </p>
        ) : (
          <p style={{ fontSize: "0.85rem", color: T.inkSoft, margin: "0 0 0.7rem 0" }}>{own ? "No annual data yet - open it to get started." : "No annual data."}</p>
        )}
        <div style={{ display: "flex", gap: "0.9rem", alignItems: "center", flexWrap: "wrap", fontSize: "0.78rem", color: T.inkSoft }}>
          {h && <span style={{ color: h.color, fontWeight: 600 }}>{h.label}</span>}
          <span>{s.periods} period{s.periods === 1 ? "" : "s"}</span>
          {s.pending > 0 && <span style={{ color: T.accent, fontWeight: 600 }}>{s.pending} pending finding{s.pending === 1 ? "" : "s"}</span>}
        </div>
      </Link>
    );
  }

  const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "1rem", flexWrap: "wrap", marginBottom: "1.4rem" }}>
        <div>
          <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0 }}>Projects</h1>
          <p style={{ fontSize: "0.85rem", color: T.inkSoft, margin: "0.4rem 0 0 0" }}>
            A project is a company. Open one to see where it stands and what to do next.
          </p>
        </div>
        <input
          aria-label="Search projects"
          placeholder="Search projects"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ fontFamily: "inherit", fontSize: "0.88rem", padding: "0.5rem 0.75rem", border: `1px solid ${T.rule}`, borderRadius: 3, background: T.card, color: T.ink, minWidth: 220 }}
        />
      </div>

      <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.1rem", margin: "0 0 0.8rem 0" }}>Your projects</h2>
      <div style={grid}>
        <Link href="/sentinel/new-project" style={{ ...card, borderStyle: "dashed", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", minHeight: 140, textAlign: "center", background: T.background }}>
          <span style={{ fontFamily: SERIF, fontSize: "1.5rem", color: T.accent, lineHeight: 1 }}>+</span>
          <span style={{ fontWeight: 600, marginTop: "0.4rem" }}>New project</span>
          <span style={{ fontSize: "0.76rem", color: T.inkSoft, marginTop: "0.2rem" }}>Set up a company in under a minute</span>
        </Link>
        {mine.map((w) => <ProjectCard key={w.id} id={w.id} />)}
      </div>
      {mine.length === 0 && !q && (
        <p style={{ fontSize: "0.88rem", color: T.inkSoft, margin: "0.9rem 0 0 0" }}>
          You have no projects yet. Create one, then add its figures by uploading a filing or a spreadsheet, or by typing them.
        </p>
      )}
      {q && mine.length === 0 && reference.length === 0 && <p style={{ fontSize: "0.88rem", color: T.inkSoft, marginTop: "0.9rem" }}>No project matches &quot;{query}&quot;.</p>}

      {reference.length > 0 && (
        <>
          <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.1rem", margin: "2rem 0 0.2rem 0" }}>Reference companies</h2>
          <p style={{ fontSize: "0.8rem", color: T.inkSoft, margin: "0 0 0.8rem 0" }}>Public filings used as the peer set. You can analyse them and export from them; they are read-only.</p>
          <div style={grid}>
            {reference.map((w) => <ProjectCard key={w.id} id={w.id} />)}
          </div>
        </>
      )}
    </div>
  );
}
