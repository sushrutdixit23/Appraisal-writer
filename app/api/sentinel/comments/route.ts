// Sentinel - the owner's side of an investigation's thread. GET returns the thread (or, with ?summary=1&workspace_id=,
// how many reviewer comments are unread per investigation, for the digest); POST adds the owner's comment; PATCH marks the
// reviewers' comments read. Only the person who owns the investigation can do any of it.

import { NextResponse } from "next/server";
import { isUuid } from "../../../sentinel/lib/access";
import { MAX_COMMENTS_PER_THREAD, readComment } from "../../../sentinel/lib/discussion";
import { authenticate, getAdmin, isFailure, loadWorkspaceFor, rateLimit } from "../../../sentinel/lib/server";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const notSetUp = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""));
const NOT_SET_UP = "Discussion is not set up on this database yet. Run supabase/migrations/20261107000000_sentinel_filings_and_discussion.sql in the Supabase SQL editor.";
const publicComment = (c: Record<string, unknown>) => ({ id: c.id, author_kind: c.author_kind, author_label: c.author_label, body: c.body, created_at: c.created_at, read: c.read_at != null });

export async function GET(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  const url = new URL(req.url);

  if (url.searchParams.get("summary")) {
    const loaded = await loadWorkspaceFor(a.admin, who.userId, url.searchParams.get("workspace_id"), "write");
    if (isFailure(loaded)) return loaded.error;
    const { data: invs } = await a.admin.from("sentinel_investigations").select("id,period_label").eq("workspace_id", loaded.workspace.id).eq("owner_id", who.userId);
    const periodOf = new Map((invs ?? []).map((i) => [i.id as string, i.period_label as string]));
    const { data, error } = await a.admin.from("sentinel_comments").select("investigation_id,author_kind,read_at").eq("workspace_id", loaded.workspace.id).eq("author_kind", "reviewer").is("read_at", null);
    if (error) return notSetUp(error) ? NextResponse.json({ unread: [], set_up: false }) : fail(error.message, 500);
    const counts = new Map<string, number>();
    for (const c of data ?? []) if (periodOf.has(c.investigation_id as string)) counts.set(c.investigation_id as string, (counts.get(c.investigation_id as string) ?? 0) + 1);
    return NextResponse.json({ unread: [...counts].map(([id, unread]) => ({ period_label: periodOf.get(id)!, unread })), set_up: true });
  }

  const id = url.searchParams.get("investigation_id");
  if (!isUuid(id)) return fail("Say which investigation.", 400);
  const { data: inv } = await a.admin.from("sentinel_investigations").select("id,owner_id").eq("id", id).maybeSingle();
  if (!inv || inv.owner_id !== who.userId) return fail("Investigation not found.", 404);
  const { data, error } = await a.admin.from("sentinel_comments").select("id,author_kind,author_label,body,read_at,created_at").eq("investigation_id", id).order("created_at", { ascending: true }).limit(MAX_COMMENTS_PER_THREAD);
  if (error) return notSetUp(error) ? NextResponse.json({ comments: [], set_up: false }) : fail(error.message, 500);
  return NextResponse.json({ comments: (data ?? []).map(publicComment), set_up: true });
}

async function ownInvestigation(a: { admin: import("@supabase/supabase-js").SupabaseClient }, userId: string, id: unknown) {
  if (!isUuid(id)) return null;
  const { data } = await a.admin.from("sentinel_investigations").select("id,workspace_id,owner_id").eq("id", id).maybeSingle();
  return data && data.owner_id === userId ? (data as { id: string; workspace_id: string }) : null;
}

export async function POST(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  const limited = rateLimit(who.userId, "comments", 60, 10 * 60_000);
  if (limited) return limited.error;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("The request body is not valid JSON.", 400); }
  const inv = await ownInvestigation(a, who.userId, body.investigation_id);
  if (!inv) return fail("Investigation not found.", 404);
  const text = readComment(body.body);
  if (!text.ok) return fail(text.error, 400);
  const { data, error } = await a.admin.from("sentinel_comments").insert({ investigation_id: inv.id, workspace_id: inv.workspace_id, author_kind: "owner", author_label: "Analyst", body: text.text }).select("id,author_kind,author_label,body,read_at,created_at").single();
  if (error || !data) return notSetUp(error) ? fail(NOT_SET_UP, 501) : fail(error?.message ?? "Could not post the comment.", 500);
  return NextResponse.json({ comment: publicComment(data) }, { status: 201 });
}

export async function PATCH(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("The request body is not valid JSON.", 400); }
  const inv = await ownInvestigation(a, who.userId, body.investigation_id);
  if (!inv) return fail("Investigation not found.", 404);
  const { error } = await a.admin.from("sentinel_comments").update({ read_at: new Date().toISOString() }).eq("investigation_id", inv.id).eq("author_kind", "reviewer").is("read_at", null);
  if (error && !notSetUp(error)) return fail(error.message, 500);
  return NextResponse.json({ ok: true });
}
