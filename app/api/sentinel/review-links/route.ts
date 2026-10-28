// Sentinel - review links (see lib/discussion.ts). POST makes a link for one investigation and returns it ONCE; GET lists
// an investigation's links; DELETE revokes one. Only the person who owns the investigation can do any of it.

import { NextResponse } from "next/server";
import { DEFAULT_LINK_DAYS, linkExpiry, linkState, readLabel } from "../../../sentinel/lib/discussion";
import { hashToken, newToken } from "../../../sentinel/lib/requests";
import { isUuid } from "../../../sentinel/lib/access";
import { authenticate, getAdmin, isFailure, rateLimit } from "../../../sentinel/lib/server";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const notSetUp = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""));
const NOT_SET_UP = "Sharing for review is not set up on this database yet. Run supabase/migrations/20261107000000_sentinel_filings_and_discussion.sql in the Supabase SQL editor.";

export async function POST(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  const limited = rateLimit(who.userId, "review-links", 20, 10 * 60_000);
  if (limited) return limited.error;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("The request body is not valid JSON.", 400); }
  if (!isUuid(body.investigation_id)) return fail("Say which investigation to share.", 400);

  const { data: inv } = await a.admin.from("sentinel_investigations").select("id,workspace_id,owner_id").eq("id", body.investigation_id).maybeSingle();
  // Someone else's investigation answers exactly like one that does not exist.
  if (!inv || inv.owner_id !== who.userId) return fail("Investigation not found.", 404);

  const token = newToken();
  const { expires_at, days } = linkExpiry(body.days);
  const label = body.label == null ? null : readLabel(body.label);
  const { data, error } = await a.admin
    .from("sentinel_review_links")
    .insert({ investigation_id: inv.id, workspace_id: inv.workspace_id, owner_id: who.userId, token_hash: hashToken(token), reviewer_label: label, expires_at })
    .select("id")
    .single();
  if (error || !data) return notSetUp(error) ? fail(NOT_SET_UP, 501) : fail(error?.message ?? "Could not create the link.", 500);
  return NextResponse.json({ id: data.id, token, review_path: `/sentinel-review/${token}`, expires_at, days }, { status: 201 });
}

export async function GET(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  const id = new URL(req.url).searchParams.get("investigation_id");
  if (!isUuid(id)) return fail("Say which investigation.", 400);
  const { data, error } = await a.admin.from("sentinel_review_links").select("id,reviewer_label,expires_at,revoked_at,created_at").eq("investigation_id", id).eq("owner_id", who.userId).order("created_at", { ascending: false }).limit(20);
  if (error) return notSetUp(error) ? NextResponse.json({ links: [], set_up: false }) : fail(error.message, 500);
  // Only the listed columns leave this route, never the token hash.
  const links = (data ?? []).map((l) => ({ id: l.id, label: l.reviewer_label, expires_at: l.expires_at, created_at: l.created_at, state: linkState(l) }));
  return NextResponse.json({ links, set_up: true, default_days: DEFAULT_LINK_DAYS });
}

export async function DELETE(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  const id = new URL(req.url).searchParams.get("id");
  if (!isUuid(id)) return fail("Say which link to revoke.", 400);
  const { data: link } = await a.admin.from("sentinel_review_links").select("id").eq("id", id).eq("owner_id", who.userId).maybeSingle();
  if (!link) return fail("Link not found.", 404);
  const { error } = await a.admin.from("sentinel_review_links").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("owner_id", who.userId);
  if (error) return fail(error.message, 500);
  return NextResponse.json({ ok: true });
}
