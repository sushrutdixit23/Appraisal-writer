// Sentinel - the analyst's side of the filing watcher. GET lists a company's new filings; POST checks BSE for that one
// company now and reports exactly what happened (the quickest way to learn whether the feed is reachable); PATCH
// dismisses a filing once it has been dealt with.

import { NextResponse } from "next/server";
import { watchFilings } from "../../../sentinel/lib/filingWatch";
import { authenticate, getAdmin, isFailure, loadWorkspaceFor, rateLimit } from "../../../sentinel/lib/server";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const notSetUp = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""));
const publicFiling = (r: Record<string, unknown>) => ({ id: r.id, workspace_id: r.workspace_id, kind: r.kind, headline: r.headline, filed_at: r.filed_at, url: r.url, status: r.status });

export async function GET(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  const loaded = await loadWorkspaceFor(a.admin, who.userId, new URL(req.url).searchParams.get("workspace_id"), "write");
  if (isFailure(loaded)) return loaded.error;
  const { data, error } = await a.admin.from("sentinel_filings").select("id,workspace_id,kind,headline,filed_at,url,status").eq("workspace_id", loaded.workspace.id).eq("status", "new").order("filed_at", { ascending: false }).limit(20);
  if (error) return notSetUp(error) ? NextResponse.json({ filings: [], set_up: false }) : fail(error.message, 500);
  return NextResponse.json({ filings: (data ?? []).map(publicFiling), set_up: true });
}

export async function POST(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  const limited = rateLimit(who.userId, "filings-check", 10, 10 * 60_000);
  if (limited) return limited.error;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("The request body is not valid JSON.", 400); }
  const loaded = await loadWorkspaceFor(a.admin, who.userId, body.workspace_id, "write");
  if (isFailure(loaded)) return loaded.error;
  const code = loaded.workspace.bse_code ?? null;
  if (!code) return fail("This company has no BSE scrip code. Add one under Settings > Market data.", 400);
  const result = await watchFilings(a.admin, [{ id: loaded.workspace.id, bse_code: code }]);
  if (result.not_set_up) return fail("The filing watcher is not set up on this database yet. Run supabase/migrations/20261107000000_sentinel_filings_and_discussion.sql in the Supabase SQL editor.", 501);
  return NextResponse.json(result);
}

export async function PATCH(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("The request body is not valid JSON.", 400); }
  const loaded = await loadWorkspaceFor(a.admin, who.userId, body.workspace_id, "write");
  if (isFailure(loaded)) return loaded.error;
  if (typeof body.id !== "string") return fail("Say which filing to dismiss.", 400);
  // Scoped to the company just authorised, so one person cannot dismiss another's filing by guessing an id.
  const { error } = await a.admin.from("sentinel_filings").update({ status: "dismissed" }).eq("id", body.id).eq("workspace_id", loaded.workspace.id);
  if (error) return fail(error.message, 500);
  return NextResponse.json({ ok: true });
}
