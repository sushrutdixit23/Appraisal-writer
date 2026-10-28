// Sentinel - the morning digest, pushed. For every person who owns a company, build their coverage digest and post it
// to DIGEST_WEBHOOK_URL (a Slack incoming webhook, a Discord webhook, or anything that accepts { text } / { content }
// - n8n and Zapier included). One webhook for the deployment: per-person delivery needs per-person settings, which
// this does not pretend to have. With no webhook set it does nothing and says so.

import { NextResponse } from "next/server";
import { cronAuthorised, cronRefusal, digestMessage } from "../../../../sentinel/lib/cron";
import { buildDigest, type DigestInput } from "../../../../sentinel/lib/digest";
import { getAdmin, isFailure } from "../../../../sentinel/lib/server";
import type { FinancialStatement, Investigation, Recommendation, Workspace } from "../../../../sentinel/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!cronAuthorised(req)) return cronRefusal();
  const hook = process.env.DIGEST_WEBHOOK_URL;
  if (!hook) return NextResponse.json({ sent: 0, note: "DIGEST_WEBHOOK_URL is not set, so there is nowhere to send the digest." });
  const a = getAdmin();
  if (isFailure(a)) return a.error;

  const { data: wsData, error } = await a.admin.from("sentinel_workspaces").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const workspaces = (wsData ?? []) as Workspace[];
  const ids = workspaces.map((w) => w.id);
  const [st, inv, rec, req2, fil, com] = await Promise.all([
    ids.length ? a.admin.from("sentinel_statements").select("*").in("workspace_id", ids) : Promise.resolve({ data: [] }),
    a.admin.from("sentinel_investigations").select("*"),
    a.admin.from("sentinel_recommendations").select("*"),
    a.admin.from("sentinel_data_requests").select("workspace_id,period_end_date,due_date,status"),
    a.admin.from("sentinel_filings").select("id,workspace_id,kind,headline,filed_at,url").eq("status", "new"),
    a.admin.from("sentinel_comments").select("investigation_id,workspace_id,author_kind,read_at").eq("author_kind", "reviewer").is("read_at", null),
  ]);
  const statements = (st.data ?? []) as FinancialStatement[];
  const investigations = (inv.data ?? []) as Investigation[];
  const recommendations = (rec.data ?? []) as Recommendation[];
  const requests = req2.error ? [] : ((req2.data ?? []) as { workspace_id: string; period_end_date: string; due_date: string | null; status: string }[]);

  // Each table comes from a hand-run migration; before it, that part of the digest is simply empty.
  const filings = fil.error ? [] : ((fil.data ?? []) as NonNullable<DigestInput["filings"]>);
  const periodOf = new Map(investigations.map((i) => [i.id, i.period_label]));
  const unread = new Map<string, { workspace_id: string; period_label: string; unread: number }>();
  for (const c of com.error ? [] : ((com.data ?? []) as { investigation_id: string; workspace_id: string }[])) {
    const row = unread.get(c.investigation_id) ?? { workspace_id: c.workspace_id, period_label: periodOf.get(c.investigation_id) ?? "this period", unread: 0 };
    row.unread++;
    unread.set(c.investigation_id, row);
  }
  const discussion = [...unread.values()];

  const today = new Date().toISOString().slice(0, 10);
  const owners = [...new Set(workspaces.filter((w) => w.owner_id && !w.is_public_reference).map((w) => w.owner_id as string))];
  let sent = 0;
  const failed: string[] = [];
  for (const userId of owners) {
    const mine = workspaces.filter((w) => w.owner_id === userId);
    const digest = buildDigest({ workspaces, statements, investigations, recommendations, requests, filings, discussion, userId, today });
    const text = digestMessage(mine.length === 1 ? mine[0].company_name : `${mine.length} companies`, digest, process.env.NEXT_PUBLIC_APP_URL ?? null);
    try {
      const res = await fetch(hook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, content: text }), signal: AbortSignal.timeout(15_000) });
      if (res.ok) sent++;
      else failed.push(`${userId}: ${res.status}`);
    } catch (e) {
      failed.push(`${userId}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }
  return NextResponse.json({ sent, failed });
}
