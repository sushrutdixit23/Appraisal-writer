// Sentinel - the draft earnings note as a Word file. The note is built on the server from the same functions the Results brief page uses (buildResultsBrief,
// buildVariance, compareCommentary), so it can never state a number the page would not show. Estimates and transcripts are the caller's own.

import { NextResponse } from "next/server";
import { buildEarningsNote } from "../../../../sentinel/lib/earningsNote";
import { renderEarningsNoteDocx } from "../../../../sentinel/lib/earningsNoteDocx";
import type { EstimateRow } from "../../../../sentinel/lib/estimates";
import { buildResultsBrief, priorQuarterEnd, quartersOnFile } from "../../../../sentinel/lib/quarterly";
import { authenticate, getAdmin, isFailure, loadPeerContext, loadWorkspaceFor, rateLimit, safeFilename } from "../../../../sentinel/lib/server";
import { isRealDate } from "../../../../sentinel/lib/requestDates";
import type { CommentaryItem } from "../../../../sentinel/lib/transcript";

export const runtime = "nodejs";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function POST(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  const limited = rateLimit(who.userId, "earnings-note", 20, 10 * 60_000);
  if (limited) return limited.error;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("The request body is not valid JSON.", 400); }
  const loaded = await loadWorkspaceFor(a.admin, who.userId, body.workspace_id, "read");
  if (isFailure(loaded)) return loaded.error;
  const workspace = loaded.workspace;
  if (body.period_end_date != null && !isRealDate(body.period_end_date)) return fail("The quarter end must be a date as YYYY-MM-DD.", 400);

  const context = await loadPeerContext(a.admin, who.userId, workspace);
  if (isFailure(context)) return context.error;
  const quarters = quartersOnFile(workspace, context.statements);
  if (quarters.length === 0) return fail("This company has no quarterly results on file, so there is nothing to write a note about.", 404);
  const end = typeof body.period_end_date === "string" ? body.period_end_date : quarters[0].end;
  const brief = buildResultsBrief(context.workspaces, context.statements, workspace.id, end);
  if (!brief || brief.period_end_date !== end) return fail("That quarter is not on file for this company.", 404);

  // The caller's own estimates and transcripts. Either table may not exist yet (migrations are run by hand): the note is written without them.
  const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""));
  const prevEnd = priorQuarterEnd(end);
  const est = await a.admin.from("sentinel_estimates").select("period_end_date,metric,source,source_label,value_cr").eq("workspace_id", workspace.id).eq("owner_id", who.userId).eq("period_end_date", end);
  if (est.error && !missing(est.error)) return fail(est.error.message, 500);
  const tr = await a.admin.from("sentinel_transcripts").select("period_end_date,items").eq("workspace_id", workspace.id).eq("owner_id", who.userId).in("period_end_date", [end, prevEnd]);
  if (tr.error && !missing(tr.error)) return fail(tr.error.message, 500);
  const transcripts = (tr.data ?? []) as { period_end_date: string; items: CommentaryItem[] }[];

  const note = buildEarningsNote({
    brief,
    estimates: ((est.data ?? []) as Record<string, unknown>[]).map((r) => ({ period_end_date: String(r.period_end_date), metric: r.metric, source: r.source, source_label: (r.source_label as string | null) ?? null, value_cr: Number(r.value_cr) })) as EstimateRow[],
    commentary: {
      current: transcripts.find((t) => t.period_end_date === end)?.items ?? null,
      previous: transcripts.find((t) => t.period_end_date === prevEnd)?.items ?? null,
      previous_label: brief.prior_quarter_label,
    },
    today: new Date().toISOString().slice(0, 10),
  });
  const bytes = await renderEarningsNoteDocx(note);
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": DOCX_TYPE,
      "Content-Disposition": `attachment; filename="${safeFilename(workspace.company_name)}_${safeFilename(brief.period_label, "quarter")}_earnings_note.docx"`,
      "Cache-Control": "no-store",
    },
  });
}
