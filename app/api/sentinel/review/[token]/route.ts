// Sentinel - the reviewer's side of a shared investigation. PUBLIC: there is no login, the unguessable token in the URL is
// the credential, and it only ever does two things - show ONE investigation (see lib/discussion.ts reviewView) and add a
// comment to it. A malformed, unknown, revoked or expired token all answer the same way.

import { NextResponse } from "next/server";
import { linkState, MAX_COMMENTS_PER_THREAD, readComment, readLabel, reviewView } from "../../../../sentinel/lib/discussion";
import { hashToken, looksLikeToken } from "../../../../sentinel/lib/requests";
import { getAdmin, isFailure, rateLimit } from "../../../../sentinel/lib/server";
import type { Investigation } from "../../../../sentinel/lib/types";

export const runtime = "nodejs";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const invalid = () => fail("This review link is not valid, has expired, or has been closed.", 404);
const publicComment = (c: Record<string, unknown>) => ({ id: c.id, author_kind: c.author_kind, author_label: c.author_label, body: c.body, created_at: c.created_at });

async function resolve(token: string, a: { admin: import("@supabase/supabase-js").SupabaseClient }) {
  const { data: link } = await a.admin.from("sentinel_review_links").select("id,investigation_id,workspace_id,expires_at,revoked_at,reviewer_label").eq("token_hash", hashToken(token)).maybeSingle();
  if (!link || linkState(link) !== "active") return null;
  return link as { id: string; investigation_id: string; workspace_id: string; reviewer_label: string | null };
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!looksLikeToken(token)) return invalid();
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const limited = rateLimit(hashToken(token), "review-view", 60, 10 * 60_000);
  if (limited) return limited.error;
  const link = await resolve(token, a);
  if (!link) return invalid();

  const [{ data: inv }, { data: ws }, { data: comments }] = await Promise.all([
    a.admin.from("sentinel_investigations").select("period_label,status,confidence_score,ai_narrative,final_narrative,observation,suggested_questions,grounding_warnings").eq("id", link.investigation_id).maybeSingle(),
    a.admin.from("sentinel_workspaces").select("company_name").eq("id", link.workspace_id).maybeSingle(),
    a.admin.from("sentinel_comments").select("id,author_kind,author_label,body,created_at").eq("investigation_id", link.investigation_id).order("created_at", { ascending: true }).limit(MAX_COMMENTS_PER_THREAD),
  ]);
  if (!inv || !ws) return invalid();
  return NextResponse.json({ investigation: reviewView(inv as unknown as Investigation, ws.company_name as string), comments: (comments ?? []).map(publicComment), reviewer_label: link.reviewer_label });
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!looksLikeToken(token)) return invalid();
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const hash = hashToken(token);
  const limited = rateLimit(hash, "review-comment", 10, 10 * 60_000);
  if (limited) return limited.error;
  const link = await resolve(token, a);
  if (!link) return invalid();

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("The request body is not valid JSON.", 400); }
  const text = readComment(body.body);
  if (!text.ok) return fail(text.error, 400);
  // A thread cannot be flooded: past the cap, further comments are refused rather than stored.
  const existing = await a.admin.from("sentinel_comments").select("id").eq("investigation_id", link.investigation_id).limit(MAX_COMMENTS_PER_THREAD);
  if ((existing.data?.length ?? 0) >= MAX_COMMENTS_PER_THREAD) return fail("This thread has reached its comment limit.", 429);

  const label = readLabel(body.name ?? link.reviewer_label);
  const { data, error } = await a.admin.from("sentinel_comments").insert({ investigation_id: link.investigation_id, workspace_id: link.workspace_id, author_kind: "reviewer", author_label: label, body: text.text }).select("id,author_kind,author_label,body,created_at").single();
  if (error || !data) return fail("Could not post the comment. Please try again.", 500);
  return NextResponse.json({ comment: publicComment(data) }, { status: 201 });
}
