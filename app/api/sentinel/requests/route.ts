// Sentinel - data requests (see lib/requests.ts). POST opens one for a company the caller can write to and returns the
// upload link ONCE; GET lists a company's requests and the drafts waiting on review. Everything here is the analyst's
// side and needs a logged-in caller; the CA's side is /api/sentinel/submit/[token].

import { NextResponse } from "next/server";
import { authenticate, getAdmin, isFailure, loadWorkspaceFor, rateLimit } from "../../../sentinel/lib/server";
import { CADENCES, defaultDueDate, hashToken, newToken, type Cadence } from "../../../sentinel/lib/requests";
import { isRealDate as isDate } from "../../../sentinel/lib/requestDates";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const notSetUp = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""));

export async function POST(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  const limited = rateLimit(who.userId, "requests", 30, 10 * 60_000);
  if (limited) return limited.error;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("The request body is not valid JSON.", 400);
  }
  const loaded = await loadWorkspaceFor(a.admin, who.userId, body.workspace_id, "write");
  if (isFailure(loaded)) return loaded.error;
  if (!isDate(body.period_end_date)) return fail("period_end_date must be a date as YYYY-MM-DD.", 400);
  if (body.due_date != null && !isDate(body.due_date)) return fail("due_date must be a date as YYYY-MM-DD.", 400);
  if (body.cadence != null && !(CADENCES as readonly unknown[]).includes(body.cadence)) return fail("cadence must be monthly, quarterly or annual.", 400);
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null;

  const token = newToken();
  const { data, error } = await a.admin
    .from("sentinel_data_requests")
    .insert({
      workspace_id: loaded.workspace.id,
      owner_id: who.userId,
      token_hash: hashToken(token),
      period_end_date: body.period_end_date,
      due_date: body.due_date ?? defaultDueDate(body.period_end_date),
      cadence: (body.cadence as Cadence | null) ?? null,
      note,
      status: "open",
    })
    .select("id")
    .single();
  if (error || !data) {
    if (notSetUp(error)) return fail("Data requests are not set up on this database yet. Run supabase/migrations/20261105000000_sentinel_data_requests.sql in the Supabase SQL editor.", 501);
    return fail(error?.message ?? "Could not create the request.", 500);
  }
  return NextResponse.json({ id: data.id, token, submit_path: `/submit/${token}` }, { status: 201 });
}

export async function GET(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  const loaded = await loadWorkspaceFor(a.admin, who.userId, new URL(req.url).searchParams.get("workspace_id"), "write");
  if (isFailure(loaded)) return loaded.error;

  const requests = await a.admin
    .from("sentinel_data_requests")
    .select("id,period_end_date,due_date,cadence,note,status,created_at,submitted_at")
    .eq("workspace_id", loaded.workspace.id)
    .order("period_end_date", { ascending: false })
    .limit(50);
  if (requests.error) {
    if (notSetUp(requests.error)) return NextResponse.json({ requests: [], drafts: [], set_up: false });
    return fail(requests.error.message, 500);
  }
  const drafts = await a.admin
    .from("sentinel_ingest_drafts")
    .select("id,request_id,source_file,result,status,created_at")
    .eq("workspace_id", loaded.workspace.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(20);
  // Only the listed columns leave this route, whatever the query returned: never the token hash.
  const publicRequest = (r: Record<string, unknown>) => ({ id: r.id, period_end_date: r.period_end_date, due_date: r.due_date, cadence: r.cadence, note: r.note, status: r.status, created_at: r.created_at, submitted_at: r.submitted_at });
  return NextResponse.json({ requests: (requests.data ?? []).map(publicRequest), drafts: drafts.data ?? [], set_up: true });
}
