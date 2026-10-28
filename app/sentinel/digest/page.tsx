"use client";
export const dynamic = "force-dynamic";

// Sentinel - the coverage digest: everything that needs attention today, ranked, in one place. See lib/digest.ts.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { buildDigest } from "../lib/digest";
import { useShell } from "../lib/shell/ShellData";
import { SERIF, T } from "../lib/theme";
import type { FinancialStatement, Investigation, Recommendation } from "../lib/types";

type RequestRow = { workspace_id: string; period_end_date: string; due_date: string | null; status: string };

export default function DigestPage() {
  const router = useRouter();
  const { workspaces, userId, loading: shellLoading, signedIn } = useShell();
  const [loaded, setLoaded] = useState(false);
  const [statements, setStatements] = useState<FinancialStatement[]>([]);
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);

  useEffect(() => {
    if (shellLoading) return;
    if (!signedIn) { router.push("/login"); return; }
    (async () => {
      const ids = workspaces.map((w) => w.id);
      const [st, inv, rec] = await Promise.all([
        ids.length ? supabase.from("sentinel_statements").select("*").in("workspace_id", ids) : Promise.resolve({ data: [] }),
        supabase.from("sentinel_investigations").select("*"),
        supabase.from("sentinel_recommendations").select("*"),
      ]);
      setStatements((st.data ?? []) as FinancialStatement[]);
      setInvestigations((inv.data ?? []) as Investigation[]);
      setRecommendations((rec.data ?? []) as Recommendation[]);
      // Overdue data requests come from the server (the table is closed to the browser); absent until that migration is run.
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (token) {
        const own = workspaces.filter((w) => w.owner_id === userId);
        const lists = await Promise.all(
          own.map((w) => fetch(`/api/sentinel/requests?workspace_id=${w.id}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : { requests: [] })).catch(() => ({ requests: [] })))
        );
        setRequests(lists.flatMap((l, i) => ((l.requests ?? []) as Omit<RequestRow, "workspace_id">[]).map((r) => ({ ...r, workspace_id: own[i].id }))));
      }
      setLoaded(true);
    })();
  }, [shellLoading, signedIn, workspaces, userId, router]);

  const digest = useMemo(
    () => buildDigest({ workspaces, statements, investigations, recommendations, requests, userId, today: new Date().toISOString().slice(0, 10) }),
    [workspaces, statements, investigations, recommendations, requests, userId]
  );

  if (shellLoading || !loaded) return <p style={{ color: T.inkSoft }}>Building your digest...</p>;

  return (
    <div style={{ maxWidth: 860 }}>
      <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "2.1rem", margin: 0, color: T.accent }}>Coverage digest</h1>
      <p style={{ fontSize: "0.9rem", color: T.inkSoft, margin: "0.5rem 0 1.6rem 0", lineHeight: 1.6 }} data-testid="digest-summary">
        {digest.total === 0 ? "Nothing needs your attention right now." : `${digest.total} item${digest.total > 1 ? "s" : ""} need attention across your companies.`}
      </p>
      {digest.sections.map((s) => (
        <section key={s.id} data-testid={`digest-${s.id}`} style={{ background: T.card, border: `1px solid ${T.rule}`, borderRadius: 3, padding: "1rem 1.3rem", marginBottom: "1rem" }}>
          <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "1.15rem", margin: "0 0 0.5rem 0" }}>
            {s.title} <span style={{ fontSize: "0.8rem", color: T.inkSoft, fontFamily: "inherit" }}>({s.items.length})</span>
          </h2>
          {s.items.length === 0 ? (
            <p style={{ margin: 0, fontSize: "0.85rem", color: T.inkSoft }}>{s.empty}</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {s.items.map((it, i) => (
                <li key={i} style={{ padding: "0.55rem 0", borderTop: i ? `1px solid ${T.rule}` : "none" }}>
                  <Link href={it.href} style={{ color: T.accent, fontWeight: 500, fontSize: "0.92rem", textDecoration: "none" }}>{it.title}</Link>
                  <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.82rem", color: T.inkSoft, lineHeight: 1.5 }}>{it.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
