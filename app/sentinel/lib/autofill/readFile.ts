// Sentinel autofill - bytes in, AutofillResult out, shared by the logged-in autofill route and the CA submission
// route so a file is read exactly the same way wherever it arrives. NO MODEL IS CALLED: rules only.

// Must come before the "pdf-parse" import itself: its own Vercel/Next.js troubleshooting guide says this
// resolves the worker-related crashes pdf-parse 2.x otherwise hits on serverless, since the worker script is
// embedded in this module rather than loaded from a file path the deploy's function bundle may not carry.
import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import { autofillFromPdfPages } from "./pdf";
import { autofillFromSheet, parseCsv } from "./sheet";
import { AutofillError, type AutofillOptions, type AutofillResult } from "./types";
import { xlsxToRows } from "./xlsx";

export const MAX_SHEET_BYTES = 10 * 1024 * 1024;

/** A problem the person can act on, with the HTTP status the route should answer with. */
export class ReadFileError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

type Kind = "pdf" | "xlsx" | "csv" | "xls" | "unknown";

export function sniff(buffer: Buffer, filename: string, mimeType: string): Kind {
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

export async function readFileToResult(buffer: Buffer, filename: string, mimeType: string, options: AutofillOptions): Promise<AutofillResult> {
  const kind = sniff(buffer, filename, mimeType);
  if (kind === "xls") throw new ReadFileError("Old Excel files (.xls) cannot be read. Open it in Excel and Save As .xlsx or .csv.", 400);
  if (kind === "unknown") throw new ReadFileError("That file type is not supported. Use a text PDF, a .csv or an .xlsx.", 400);
  if (kind !== "pdf" && buffer.length > MAX_SHEET_BYTES) throw new ReadFileError("That spreadsheet is larger than the 10MB limit.", 413);

  try {
    if (kind === "pdf") {
      const parser = new PDFParse({ data: buffer });
      let pages: { num: number; text: string }[];
      try {
        const parsed = await parser.getText();
        pages = parsed.pages.map((p) => ({ num: p.num, text: p.text }));
      } catch {
        await parser.destroy();
        throw new ReadFileError("Could not read this PDF. It may be corrupted.", 400);
      }
      await parser.destroy();
      if (pages.reduce((n, p) => n + p.text.trim().length, 0) < 200) {
        throw new ReadFileError(
          "This looks like a scanned or image-based PDF with no text to read. Sentinel reads text PDFs, CSV and Excel files - " +
            "use a text export of the filing, enter the figures by hand, or on the Import page use \"Scanned PDF? Read with OCR\" and name the statement pages.",
          422
        );
      }
      return autofillFromPdfPages(pages, options);
    }
    if (kind === "xlsx") {
      let rows: string[][];
      try {
        ({ rows } = await xlsxToRows(buffer));
      } catch {
        throw new ReadFileError("Could not open this Excel file. It may be corrupted or password protected.", 400);
      }
      return autofillFromSheet(rows, { ...options, kind: "xlsx" });
    }
    return autofillFromSheet(parseCsv(decodeText(buffer)), { ...options, kind: "csv" });
  } catch (e) {
    if (e instanceof ReadFileError) throw e;
    if (e instanceof AutofillError) throw new ReadFileError(e.message, 422);
    console.error("Sentinel autofill error:", e);
    throw new ReadFileError("Something went wrong reading that file.", 500);
  }
}
