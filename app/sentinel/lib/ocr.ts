// Sentinel - reading a scanned filing. A scanned PDF has pictures of pages and no text, so the usual reader finds nothing.
// Here the pages the person names are rendered to images and read by Tesseract (open source, runs inside this server -
// nothing is sent to a third party), and the text it returns goes through the SAME rules reader as any text PDF. OCR is
// the least trustworthy way in, so every figure that comes out of it is marked low confidence by the caller.
//
// Only a page range is read, never the whole file: a 300-page report is minutes of recognition, and the statements
// are a few pages the person can point at.

import os from "node:os";
import path from "node:path";
import type { PdfPage } from "./extraction";

export const MAX_OCR_PAGES = 25;

/** "140-160", "5,7,9-11" -> sorted unique page numbers; an error message when it cannot be used. */
export function parsePageRange(spec: string, max = MAX_OCR_PAGES): number[] | { error: string } {
  const pages = new Set<number>();
  for (const part of spec.split(",").map((p) => p.trim()).filter(Boolean)) {
    const m = /^(\d{1,5})(?:\s*-\s*(\d{1,5}))?$/.exec(part);
    if (!m) return { error: `"${part}" is not a page or a range like 140-160.` };
    const from = Number(m[1]), to = m[2] ? Number(m[2]) : from;
    if (from < 1 || to < from) return { error: `"${part}" is not a valid page range.` };
    if (to - from + 1 > max) return { error: `A range of more than ${max} pages is too long to read by OCR. Name just the statement pages.` };
    for (let p = from; p <= to; p++) pages.add(p);
    if (pages.size > max) return { error: `More than ${max} pages in total. Name just the statement pages.` };
  }
  if (pages.size === 0) return { error: "Say which pages to read, e.g. 140-160." };
  return [...pages].sort((a, b) => a - b);
}

/** Recognise each page image and return its text. One worker is reused for every page and always shut down. */
export async function ocrImages(images: { num: number; png: Uint8Array }[]): Promise<PdfPage[]> {
  const { createWorker } = await import("tesseract.js");
  // The English model ships in node_modules (@tesseract.js-data/eng) so nothing is downloaded at run time.
  const langPath = path.join(process.cwd(), "node_modules", "@tesseract.js-data", "eng", "4.0.0_best_int");
  const worker = await createWorker("eng", 1, { langPath, gzip: true, cachePath: os.tmpdir() });
  try {
    const pages: PdfPage[] = [];
    for (const img of images) {
      const { data } = await worker.recognize(Buffer.from(img.png));
      pages.push({ num: img.num, text: data.text });
    }
    return pages;
  } finally {
    await worker.terminate();
  }
}
