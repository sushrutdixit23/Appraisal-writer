// Sentinel - read a SCANNED PDF: render the pages the caller names, recognise them with Tesseract, and read the text
// with the same rules as a text PDF. Never writes to the database; like autofill it returns what it found for a person
// to review. Every figure is marked low confidence because OCR can misread a digit and nothing downstream can tell.

import { NextResponse } from "next/server";
import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import { autofillFromPdfPages } from "../../../sentinel/lib/autofill/pdf";
import { AutofillError, type AutofillResult } from "../../../sentinel/lib/autofill/types";
import { ocrImages, parsePageRange } from "../../../sentinel/lib/ocr";
import { authenticate, getAdmin, isFailure, rateLimit } from "../../../sentinel/lib/server";
import { BASES } from "../../../sentinel/lib/fields";
import type { Basis } from "../../../sentinel/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 30 * 1024 * 1024;
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;
  const limited = rateLimit(who.userId, "ocr", 6, 10 * 60_000);
  if (limited) return limited.error;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Upload a PDF and the page range to read.", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Upload a PDF.", 400);
  if (file.size > MAX_BYTES) return fail("That file is larger than the 30MB limit for OCR. Split out the statement pages first.", 413);
  const range = parsePageRange(String(form.get("pages") ?? ""));
  if ("error" in range) return fail(range.error, 400);
  const basisRaw = String(form.get("basis") ?? "");
  const basis: Basis | null = (BASES as readonly string[]).includes(basisRaw) ? (basisRaw as Basis) : null;
  const fyStart = Number(form.get("fy_start_month") ?? 4);

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") return fail("That file is not a PDF.", 400);

  const parser = new PDFParse({ data: buffer });
  try {
    let shots;
    try {
      shots = await parser.getScreenshot({ partial: range, scale: 2.5 });
    } catch {
      return fail("Could not read those pages. Check the page numbers and that the file is not corrupted.", 400);
    }
    if (shots.pages.length === 0) return fail("None of those pages exist in this file.", 400);
    const pages = await ocrImages(shots.pages.map((p) => ({ num: p.pageNumber, png: p.data })));
    if (pages.reduce((n, p) => n + p.text.trim().length, 0) < 100) return fail("No text could be recognised on those pages. Is the scan too faint or the range wrong?", 422);

    const result: AutofillResult = autofillFromPdfPages(pages, {
      preferredBasis: basis,
      fyStartMonth: Number.isInteger(fyStart) && fyStart >= 1 && fyStart <= 12 ? fyStart : 4,
      sourceFile: file.name.slice(0, 200) || "scanned.pdf",
    });
    // OCR can turn a 6 into a 5 and every identity check will still pass on a consistent misreading: nothing is "high".
    for (const p of result.periods) for (const hit of Object.values(p.fields)) if (hit) hit.confidence = "low";
    result.notes.unshift(`Read from scanned images by OCR (pages ${range[0]}-${range[range.length - 1]}): every figure is marked for review - check each against the page.`);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AutofillError) return fail(e.message, 422);
    console.error("Sentinel OCR error:", e);
    return fail("Something went wrong reading the scanned pages.", 500);
  } finally {
    await parser.destroy();
  }
}
