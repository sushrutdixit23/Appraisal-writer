// Sentinel - reading an uploaded file from either of the two ways it arrives: a multipart upload (small files,
// under Vercel's 4.5MB body limit) or { blob_url } for a large PDF the browser put on Vercel Blob first. Shared by
// the autofill route and the (optional, model-based) extract route so both apply the same limits and the same
// rule that a blob URL must be one this app issued.

import { NextResponse } from "next/server";
import { BASES } from "./fields";
import { parseBlobUrl } from "./extraction";
import type { Basis, PeriodType } from "./types";

export const MAX_FILE_BYTES = 100 * 1024 * 1024;

export type Upload = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  basis: Basis | null;
  periodType: PeriodType | null;
  fyStartMonth: number | null;
};

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

const asBasis = (v: unknown): Basis | null => (typeof v === "string" && (BASES as readonly string[]).includes(v) ? (v as Basis) : null);
const asPeriod = (v: unknown): PeriodType | null => (typeof v === "string" && /^(FY|Q[1-4])$/.test(v) ? (v as PeriodType) : null);
const asMonth = (v: unknown): number | null => {
  const n = typeof v === "string" || typeof v === "number" ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
};

export async function readUpload(req: Request): Promise<Upload | { error: NextResponse }> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    let body: { blob_url?: unknown; filename?: unknown; basis?: unknown; period_type?: unknown; fy_start_month?: unknown };
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
    // Once the bytes are in hand the stored copy has no further use. Best effort: a failed delete must not
    // fail the request.
    await (await import("@vercel/blob")).del(url.href).catch((e) => console.error("Sentinel: could not delete uploaded blob:", e));
    if (buffer.length > MAX_FILE_BYTES) return { error: fail("That file is larger than the 100MB limit.", 413) };
    const filename = typeof body.filename === "string" && body.filename.trim() ? body.filename.trim().slice(0, 200) : "uploaded.pdf";
    return { buffer, filename, mimeType: "application/pdf", basis: asBasis(body.basis), periodType: asPeriod(body.period_type), fyStartMonth: asMonth(body.fy_start_month) };
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return { error: fail("Could not read the upload.", 400) };
  }
  const file = form.get("file");
  if (!(file instanceof File)) return { error: fail("No file uploaded.", 400) };
  if (file.size > MAX_FILE_BYTES) return { error: fail("That file is larger than the 100MB limit.", 413) };
  return {
    buffer: Buffer.from(await file.arrayBuffer()),
    filename: file.name.slice(0, 200),
    mimeType: file.type,
    basis: asBasis(form.get("basis")),
    periodType: asPeriod(form.get("period_type")),
    fyStartMonth: asMonth(form.get("fy_start_month")),
  };
}
