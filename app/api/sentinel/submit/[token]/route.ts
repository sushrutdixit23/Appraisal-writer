// Sentinel - the CA's side of a data request. PUBLIC: there is no login, the unguessable token in the URL is the
// credential, and it only ever does one thing - hand a file to the company it was issued for. What comes back is a
// summary, never the company's other data. The file is read by rules (no model), and the result is stored as a
// DRAFT for an analyst; nothing here writes to the statements.

import { NextResponse } from "next/server";
import { readFileToResult, ReadFileError } from "../../../../sentinel/lib/autofill/readFile";
import { getAdmin, isFailure, rateLimit } from "../../../../sentinel/lib/server";
import { hashToken, looksLikeToken, MAX_SUBMISSION_BYTES } from "../../../../sentinel/lib/requests";

export const runtime = "nodejs";
export const maxDuration = 120;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  // Same answer for a malformed, unknown or closed token: a guesser learns nothing about which exist.
  const invalid = () => fail("This upload link is not valid or has been closed.", 404);
  if (!looksLikeToken(token)) return invalid();
  const a = getAdmin();
  if (isFailure(a)) return a.error;

  const hash = hashToken(token);
  const limited = rateLimit(hash, "submit", 10, 10 * 60_000);
  if (limited) return limited.error;

  const { data: request } = await a.admin.from("sentinel_data_requests").select("id,workspace_id,period_end_date,status").eq("token_hash", hash).maybeSingle();
  if (!request || request.status === "closed") return invalid();

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } catch {
    return fail("Upload a file.", 400);
  }
  if (!file || file.size === 0) return fail("Upload a file.", 400);
  if (file.size > MAX_SUBMISSION_BYTES) return fail("That file is larger than 4MB. Send a trial balance or an Excel export rather than a full annual report.", 413);

  const { data: workspace } = await a.admin.from("sentinel_workspaces").select("comparison_basis,fiscal_year_start_month").eq("id", request.workspace_id).maybeSingle();
  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = file.name.slice(0, 200) || "submission";
  try {
    const result = await readFileToResult(buffer, filename, file.type, {
      preferredBasis: workspace?.comparison_basis ?? null,
      fyStartMonth: workspace?.fiscal_year_start_month ?? 4,
      sourceFile: filename,
      periodEndDate: request.period_end_date,
    });
    const saved = await a.admin.from("sentinel_ingest_drafts").insert({ request_id: request.id, workspace_id: request.workspace_id, source_file: filename, result, status: "pending" });
    if (saved.error) return fail("Could not record the submission. Please try again.", 500);
    await a.admin.from("sentinel_data_requests").update({ status: "submitted", submitted_at: new Date().toISOString() }).eq("id", request.id);
    return NextResponse.json({
      ok: true,
      periods: result.periods.length,
      figures: result.periods.reduce((n, p) => n + Object.keys(p.fields).length, 0),
      warnings: [...result.notes, ...result.periods.flatMap((p) => p.notes)].slice(0, 6),
    });
  } catch (e) {
    if (e instanceof ReadFileError) return fail(e.message, e.status);
    throw e;
  }
}
