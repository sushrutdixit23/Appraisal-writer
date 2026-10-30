// Sentinel - fetch a company's latest annual report from BSE and read it, so it need not be downloaded and uploaded by hand. NOT VERIFIED AGAINST THE LIVE SITE (see
// lib/bseReport.ts): the sandbox this was built in cannot reach bseindia.com. Like the autofill route it NEVER writes to the database; it returns what it read, per
// period, for the Import page's preview, where a person decides what is saved.
//
// POST { workspace_id }            find the newest annual-report announcement for the company's BSE scrip code and download its file
// POST { workspace_id, url }       the same, from an address pasted from BSE's own page (only bseindia.com is ever fetched)

import { NextResponse } from "next/server";
import { readFileToResult, ReadFileError } from "../../../sentinel/lib/autofill/readFile";
import { downloadPdf, fetchAnnualReport, isBseUrl } from "../../../sentinel/lib/bseReport";
import { authenticate, getAdmin, isFailure, loadWorkspaceFor, rateLimit } from "../../../sentinel/lib/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  const limited = rateLimit(who.userId, "annual-report", 6, 10 * 60_000);
  if (limited) return limited.error;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("The request body is not valid JSON.", 400); }
  const loaded = await loadWorkspaceFor(a.admin, who.userId, body.workspace_id, "write");
  if (isFailure(loaded)) return loaded.error;
  const w = loaded.workspace;

  let buffer: Buffer, filename: string, source: { url: string; headline: string | null; filed_at: string | null };
  if (typeof body.url === "string" && body.url.trim() !== "") {
    const url = body.url.trim();
    if (!isBseUrl(url)) return fail("Only an address on bseindia.com (https) can be fetched.", 400);
    const got = await downloadPdf(url);
    if (!got.ok) return fail(got.error, 502);
    buffer = got.buffer;
    filename = decodeURIComponent(new URL(got.url).pathname.split("/").pop() || "annual-report.pdf");
    source = { url: got.url, headline: null, filed_at: null };
  } else {
    if (!w.bse_code) return fail("This company has no BSE scrip code. Add one under Settings > Market data, or paste the PDF's address from BSE.", 400);
    const got = await fetchAnnualReport(w.bse_code);
    if (!got.ok) return fail(got.error, 502);
    buffer = got.buffer;
    filename = got.filename;
    source = { url: got.url, headline: got.report.headline, filed_at: got.report.filed_at };
  }

  try {
    const result = await readFileToResult(buffer, filename, "application/pdf", { preferredBasis: w.comparison_basis, fyStartMonth: w.fiscal_year_start_month ?? 4, sourceFile: filename });
    return NextResponse.json({ name: filename, result, source, bytes: buffer.length });
  } catch (e) {
    if (e instanceof ReadFileError) return fail(e.message, e.status);
    throw e;
  }
}
