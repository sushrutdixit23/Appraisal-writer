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
import { PDFParse } from "pdf-parse";
import { del } from "@vercel/blob";
import { ALL_FIELD_KEYS, BASES } from "../../../sentinel/lib/fields";
import {
  EXTRACTION_SYSTEM_PROMPT,
  buildExtractionUserPrompt,
  checkDraft,
  parseBlobUrl,
  parseModelDraft,
  resolveUnit,
  selectStatementPages,
  ungroundedFields,
  type PdfPage,
} from "../../../sentinel/lib/extraction";
import { authenticate, getAdmin, isFailure } from "../../../sentinel/lib/server";
import type { Basis } from "../../../sentinel/lib/types";

export const runtime = "nodejs";

const MODEL = "claude-sonnet-5";
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_PROMPT_CHARS = 150_000;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const looksLikePdf = (b: Buffer) => b.subarray(0, 5).toString("latin1") === "%PDF-";

type Upload = { buffer: Buffer; filename: string; basis: Basis | null };

async function readUpload(req: Request): Promise<Upload | { error: NextResponse }> {
  const asBasis = (v: unknown): Basis | null =>
    typeof v === "string" && (BASES as readonly string[]).includes(v) ? (v as Basis) : null;
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    let body: { blob_url?: unknown; filename?: unknown; basis?: unknown };
    try {
      body = await req.json();
    } catch {
      return { error: fail("The request body is not valid JSON.", 400) };
    }
    if (!body.blob_url) return { error: fail("Missing blob_url.", 400) };
    const url = parseBlobUrl(body.blob_url);
    if (!url) return { error: fail("That file location is not one this app issued.", 400) };

    const res = await fetch(url.href);
    if (!res.ok) return { error: fail("Could not fetch the uploaded file from storage.", 502) };
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_FILE_BYTES) return { error: fail("That file is larger than the 100MB limit.", 413) };
    const buffer = Buffer.from(await res.arrayBuffer());
    // Once the bytes are in hand the stored copy has no further use. Best effort: a failed delete
    // must not fail the extraction.
    await del(url.href).catch((e) => console.error("Sentinel: could not delete uploaded blob:", e));
    if (buffer.length > MAX_FILE_BYTES) return { error: fail("That file is larger than the 100MB limit.", 413) };
    const filename = typeof body.filename === "string" && body.filename.trim() ? body.filename.trim().slice(0, 200) : "uploaded.pdf";
    return { buffer, filename, basis: asBasis(body.basis) };
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return { error: fail("Could not read the upload.", 400) };
  }
  const file = form.get("file");
  if (!(file instanceof File)) return { error: fail("No file uploaded.", 400) };
  if (file.type !== "application/pdf") return { error: fail("Only PDF files are supported right now.", 400) };
  if (file.size > MAX_FILE_BYTES) return { error: fail("That file is larger than the 100MB limit.", 413) };
  return { buffer: Buffer.from(await file.arrayBuffer()), filename: file.name.slice(0, 200), basis: asBasis(form.get("basis")) };
}

export async function POST(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;

  const upload = await readUpload(req);
  if ("error" in upload) return upload.error;
  const { buffer, filename, basis: preferredBasis } = upload;
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

  const unit = resolveUnit(selection?.unit ?? null, draft.model_unit);
  if (unit.note) notes.push(unit.note);
  if (preferredBasis && draft.basis && draft.basis !== preferredBasis) {
    notes.push(`The figures are ${draft.basis}, but this company is compared on a ${preferredBasis} basis.`);
  }

  return NextResponse.json({
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
