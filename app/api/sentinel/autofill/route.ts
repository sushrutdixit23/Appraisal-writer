// Sentinel - autofill from a file: PDF, CSV or Excel. NO MODEL IS CALLED HERE. The statement pages (PDF) or
// the sheet are read by rules (see app/sentinel/lib/autofill): the same file gives the same answer every time,
// it costs nothing, nothing leaves the server, and every figure comes back with the line it was read from.
//
// Like the extract route it NEVER writes to the database: it returns what it found, per period, for a person to
// review in the form or the import preview before anything is saved.

import { NextResponse } from "next/server";
import { readFileToResult, ReadFileError } from "../../../sentinel/lib/autofill/readFile";
import { authenticate, getAdmin, isFailure } from "../../../sentinel/lib/server";
import { readUpload } from "../../../sentinel/lib/upload";

export const runtime = "nodejs";
// 300s is the ceiling Vercel allows on every plan (Hobby's own max); set explicitly so a reading on a plan
// without Fluid Compute enabled does not fall back to a much shorter legacy default.
export const maxDuration = 300;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;

  const upload = await readUpload(req);
  if ("error" in upload) return upload.error;
  const { buffer, filename, mimeType } = upload;
  try {
    const result = await readFileToResult(buffer, filename, mimeType, {
      preferredBasis: upload.basis,
      periodType: upload.periodType,
      fyStartMonth: upload.fyStartMonth ?? 4,
      sourceFile: filename,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ReadFileError) return fail(e.message, e.status);
    throw e;
  }
}
