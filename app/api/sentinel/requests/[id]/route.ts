// Sentinel - settle a request or a draft. PATCH { draft_id, status: "imported" | "dismissed" } marks a draft once an
// analyst has dealt with it; PATCH { status: "closed" } closes a request so its link stops accepting files.

import { NextResponse } from "next/server";
import { authenticate, getAdmin, isFailure, loadWorkspaceFor } from "../../../../sentinel/lib/server";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("The request body is not valid JSON.", 400);
  }
  const { data: request } = await a.admin.from("sentinel_data_requests").select("id,workspace_id").eq("id", id).maybeSingle();
  if (!request) return fail("Request not found.", 404);
  // Ownership is the company's, not the request's: whoever may write to the company may settle its requests.
  const loaded = await loadWorkspaceFor(a.admin, who.userId, request.workspace_id, "write");
  if (isFailure(loaded)) return fail("Request not found.", 404);

  if (typeof body.draft_id === "string") {
    if (body.status !== "imported" && body.status !== "dismissed") return fail("status must be imported or dismissed.", 400);
    const { error } = await a.admin.from("sentinel_ingest_drafts").update({ status: body.status }).eq("id", body.draft_id).eq("request_id", id);
    return error ? fail(error.message, 500) : NextResponse.json({ ok: true });
  }
  if (body.status === "closed") {
    const { error } = await a.admin.from("sentinel_data_requests").update({ status: "closed" }).eq("id", id);
    return error ? fail(error.message, 500) : NextResponse.json({ ok: true });
  }
  return fail("Nothing to change.", 400);
}
