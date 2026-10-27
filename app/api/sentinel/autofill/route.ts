// Sentinel - autofill from a file: PDF, CSV or Excel. NO MODEL IS CALLED HERE. The statement pages (PDF) or
// the sheet are read by rules (see app/sentinel/lib/autofill): the same file gives the same answer every time,
// it costs nothing, nothing leaves the server, and every figure comes back with the line it was read from.
//
// Like the extract route it NEVER writes to the database: it returns what it found, per period, for a person to
// review in the form or the import preview before anything is saved.

import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { autofillFromPdfPages } from "../../../sentinel/lib/autofill/pdf";
import { autofillFromSheet, parseCsv } from "../../../sentinel/lib/autofill/sheet";
import { AutofillError, type AutofillResult } from "../../../sentinel/lib/autofill/types";
import { xlsxToRows } from "../../../sentinel/lib/autofill/xlsx";
import { authenticate, getAdmin, isFailure } from "../../../sentinel/lib/server";
import { readUpload } from "../../../sentinel/lib/upload";

export const runtime = "nodejs";

const MAX_SHEET_BYTES = 10 * 1024 * 1024;
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

type Kind = "pdf" | "xlsx" | "csv" | "xls" | "unknown";

function sniff(buffer: Buffer, filename: string, mimeType: string): Kind {
  if (buffer.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return /\.xls[xm]$/i.test(filename) || /spreadsheetml/.test(mimeType) ? "xlsx" : "unknown";
  if (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) return "xls";
  const head = buffer.subarray(0, 4096);
  if (head.includes(0)) return "unknown"; // binary, not text
  if (/\.(csv|tsv|txt)$/i.test(filename) || /^text\//.test(mimeType) || /csv/.test(mimeType)) return "csv";
  return "unknown";
}

function decodeText(buffer: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    // "CSV (Comma delimited)" from Excel on Windows is Windows-1252, not UTF-8.
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

export async function POST(req: Request) {
  const a = getAdmin();
  if (isFailure(a)) return a.error;
  const who = await authenticate(req, a.admin);
  if (isFailure(who)) return who.error;

  const upload = await readUpload(req);
  if ("error" in upload) return upload.error;
  const { buffer, filename, mimeType } = upload;
  const options = {
    preferredBasis: upload.basis,
    periodType: upload.periodType,
    fyStartMonth: upload.fyStartMonth ?? 4,
    sourceFile: filename,
  };

  const kind = sniff(buffer, filename, mimeType);
  if (kind === "xls") return fail("Old Excel files (.xls) cannot be read. Open it in Excel and Save As .xlsx or .csv.", 400);
  if (kind === "unknown") return fail("That file type is not supported. Use a text PDF, a .csv or an .xlsx.", 400);
  if (kind !== "pdf" && buffer.length > MAX_SHEET_BYTES) return fail("That spreadsheet is larger than the 10MB limit.", 413);

  try {
    let result: AutofillResult;
    if (kind === "pdf") {
      const parser = new PDFParse({ data: buffer });
      let pages: { num: number; text: string }[];
      try {
        const parsed = await parser.getText();
        pages = parsed.pages.map((p) => ({ num: p.num, text: p.text }));
      } catch {
        await parser.destroy();
        return fail("Could not read this PDF. It may be corrupted.", 400);
      }
      await parser.destroy();
      if (pages.reduce((n, p) => n + p.text.trim().length, 0) < 200) {
        return fail(
          "This looks like a scanned or image-based PDF with no text to read. Sentinel reads text PDFs, CSV and Excel files - " +
            "use a text export of the filing, or enter the figures by hand.",
          422
        );
      }
      result = autofillFromPdfPages(pages, options);
    } else if (kind === "xlsx") {
      let rows: string[][];
      try {
        ({ rows } = await xlsxToRows(buffer));
      } catch {
        return fail("Could not open this Excel file. It may be corrupted or password protected.", 400);
      }
      result = autofillFromSheet(rows, { ...options, kind: "xlsx" });
    } else {
      result = autofillFromSheet(parseCsv(decodeText(buffer)), { ...options, kind: "csv" });
    }
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AutofillError) return fail(e.message, 422);
    console.error("Sentinel autofill error:", e);
    return fail("Something went wrong reading that file.", 500);
  }
}
