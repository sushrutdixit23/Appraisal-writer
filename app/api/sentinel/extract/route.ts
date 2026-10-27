// Sentinel - Document Intelligence: PDF -> structured FinancialStatement
// draft. Text-based PDFs only (pdf-parse extracts the text; Claude only
// labels figures that are on the page - it never supplies a number that is
// not there). Scanned or image-only PDFs are refused with a clear message
// rather than read badly; there is no image or OCR input.
//
// This route NEVER writes to sentinel_statements. It returns a draft for the
// form to pre-fill, where a person reviews and edits before saving - same
// confirm-before-trust pattern as the narrative approval gate.
//
// What it does, in order:
//   1. Accepts the PDF either as a multipart upload (small files, under
//      Vercel's 4.5MB body limit) or as { blob_url, filename } for large
//      reports uploaded straight to Vercel Blob. The blob URL must be one
//      the upload route issued (see parseBlobUrl), and the blob is deleted
//      as soon as its bytes have been read - a company's filing is not left
//      on public storage.
//   2. Scores every page and keeps the financial-statement pages (and only
//      the requested basis, where the pages say which is which).
//   3. Reads the reporting unit from those pages.
//   4. Asks the model to label the figures, then checks the reply: every
//      number must appear in the text it was given, the accounting
//      identities must hold, and anything that fails is marked "verify".

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
// Must come before the "pdf-parse" import itself: its own Vercel/Next.js troubleshooting guide says this
// resolves the worker-related crashes pdf-parse 2.x otherwise hits on serverless, since the worker script is
// embedded in this module rather than loaded from a file path the deploy's function bundle may not carry.
import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import { ALL_FIELD_KEYS, ALL_FIELDS } from "../../../sentinel/lib/fields";
import {
  EXTRACTION_SYSTEM_PROMPT,
  buildExtractionUserPrompt,
  checkDraft,
  checkGrounding,
  groundingNotes,
  locateQuotePage,
  parseModelDraft,
  resolveUnit,
  selectStatementPages,
  ungroundedFields,
  type PdfPage,
} from "../../../sentinel/lib/extraction";
import { authenticate, rateLimit, getAdmin, isFailure } from "../../../sentinel/lib/server";
import { readUpload } from "../../../sentinel/lib/upload";

export const runtime = "nodejs";
// 300s is the ceiling Vercel allows on every plan (Hobby's own max); set explicitly so a reading on a plan
// without Fluid Compute enabled does not fall back to a much shorter legacy default.
export const maxDuration = 300;

const MODEL = "claude-sonnet-5";
const MAX_PROMPT_CHARS = 150_000;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const looksLikePdf = (b: Buffer) => b.subarray(0, 5).toString("latin1") === "%PDF-";

export async function POST(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  const limited = rateLimit(who.userId, "extract", 20, 10 * 60_000);
  if (limited) return limited.error;

  const upload = await readUpload(req);
  if ("error" in upload) return upload.error;
  const { buffer, filename, basis: preferredBasis } = upload;
  if (upload.mimeType !== "application/pdf" && !looksLikePdf(buffer)) return fail("Only PDF files are supported right now.", 400);
  if (!looksLikePdf(buffer)) return fail("That file is not a PDF.", 400);

  let pages: PdfPage[];
  const parser = new PDFParse({ data: buffer });
  try {
    const parsed = await parser.getText();
    pages = parsed.pages.map((p) => ({ num: p.num, text: p.text }));
  } catch {
    await parser.destroy();
    return fail("Could not read this PDF. It may be corrupted.", 400);
  }
  await parser.destroy();

  const totalChars = pages.reduce((n, p) => n + p.text.trim().length, 0);
  if (totalChars < 200) {
    return fail(
      "This looks like a scanned or image-based PDF with little to no extractable text. " +
        "Document Intelligence reads text-based PDFs only - please enter the figures manually, " +
        "or try a text-based export of this filing.",
      422
    );
  }

  // The statement pages; if no page looks like one, fall back to the start of the text and say so.
  const selection = selectStatementPages(pages, { maxChars: MAX_PROMPT_CHARS, preferredBasis });
  const promptText =
    selection?.text ??
    pages.map((p) => `=== PAGE ${p.num} ===\n${p.text.trim()}`).join("\n\n").slice(0, MAX_PROMPT_CHARS);
  const notes: string[] = selection ? [...selection.notes] : ["No page looked like a financial statement, so the start of the document was read - verify every figure."];

  let raw: string;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildExtractionUserPrompt({ fieldList: [...ALL_FIELD_KEYS], preferredBasis, text: promptText }),
        },
      ],
    });
    raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => ("text" in b ? b.text : ""))
      .join("");
  } catch (err) {
    console.error("Sentinel extract model error:", err);
    return fail("Could not extract structured data from this filing. Please enter the figures manually.", 502);
  }

  let parsedReply: ReturnType<typeof parseModelDraft>;
  try {
    parsedReply = parseModelDraft(raw);
  } catch (err) {
    console.error("Sentinel extract parse error:", err);
    return fail("Could not extract structured data from this filing. Please enter the figures manually.", 502);
  }
  const { draft, problems } = parsedReply;
  notes.push(...problems);

  // Verification, in code, of what the model returned.
  const low = new Set(draft.low_confidence_fields);
  const missing = ungroundedFields(draft.fields, promptText);
  for (const key of missing) low.add(key);
  if (missing.length > 0) {
    notes.push(`Not found as printed in the text that was read: ${missing.join(", ")}. Check these against the filing.`);
  }
  const issues = checkDraft(draft.fields);
  for (const issue of issues) {
    for (const key of issue.fields) low.add(key);
  }

  // Per-field grounding: does the row the model cited for a figure actually say so? Independent
  // of ungroundedFields above, which only checks that the value appears somewhere on the page.
  const fieldLabel = (key: string) => ALL_FIELDS.find((f) => f.key === key)?.label ?? key;
  const grounding = checkGrounding(draft.fields, draft.field_quotes, draft.field_labels, promptText);
  for (const key of Object.keys(grounding) as (keyof typeof grounding)[]) low.add(key);
  notes.push(...groundingNotes(fieldLabel, grounding));

  const unit = resolveUnit(selection?.unit ?? null, draft.model_unit);
  if (unit.note) notes.push(unit.note);
  if (preferredBasis && draft.basis && draft.basis !== preferredBasis) {
    notes.push(`The figures are ${draft.basis}, but this company is compared on a ${preferredBasis} basis.`);
  }

  const fieldSources: Record<string, { quote: string; page: number | null }> = {};
  for (const key of Object.keys(draft.fields)) {
    const quote = draft.field_quotes[key as keyof typeof draft.field_quotes];
    if (quote) fieldSources[key] = { quote: quote.slice(0, 200), page: locateQuotePage(quote, pages) };
  }

  return NextResponse.json({
    field_sources: fieldSources,
    period_type: draft.period_type,
    period_label: draft.period_label,
    period_end_date: draft.period_end_date,
    basis: draft.basis,
    fields: draft.fields,
    extraction_notes: [draft.extraction_notes, ...notes].filter(Boolean).join(" ") || null,
    low_confidence_fields: [...low],
    // Unit the figures are in, so the form can convert them to the company's reporting unit.
    unit: unit.unit,
    unit_source: unit.source,
    checks: issues.map((i) => i.message),
    pages_used: selection?.pages ?? [],
    source_file: filename,
  });
}
