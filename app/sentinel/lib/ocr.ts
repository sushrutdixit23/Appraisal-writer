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

/** Pixels lighter than this become white, darker become black. Annual reports often print the current-year column and its
 * header in light grey; Tesseract drops that print entirely (a "2026 2025" header came back as "om 200"), and the rules
 * reader then cannot tell which column is which year. Forcing every pixel to black or white keeps the grey. */
const BLACK_BELOW = 215;

/** Convert a page image to pure black and white before recognition. */
export async function enhanceForOcr(png: Uint8Array): Promise<Uint8Array> {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const img = await loadImage(Buffer.from(png));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const frame = ctx.getImageData(0, 0, img.width, img.height);
  const d = frame.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < BLACK_BELOW ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(frame, 0, 0);
  return canvas.toBuffer("image/png");
}

/** Tesseract often reads the thousands comma as a full stop ("10,459" as "10.459", "1,48,819" as "148.819"). A statement in crore, lakh or
 * million never prints three decimals, so a dot followed by exactly three digits is a mangled comma. Applied to OCR text only. */
export function repairOcrNumbers(text: string): string {
  return text.replace(/(?<![\d.])(\d{1,3})\.(\d{3})(?![\d.])/g, "$1,$2");
}

/** Recognise each page image and return its text. One worker is reused for every page and always shut down. */
export async function ocrImages(images: { num: number; png: Uint8Array }[]): Promise<PdfPage[]> {
  const { createWorker } = await import("tesseract.js");
  // The English model ships in node_modules (@tesseract.js-data/eng) so nothing is downloaded at run time.
  const langPath = path.join(process.cwd(), "node_modules", "@tesseract.js-data", "eng", "4.0.0_best_int");
  const worker = await createWorker("eng", 1, { langPath, gzip: true, cachePath: os.tmpdir() });
  try {
    // Keep the gaps between words: a statement is columns, and the rules reader tells the year columns and the note column
    // apart by where the numbers sit, which is lost if Tesseract collapses the spaces.
    await worker.setParameters({ preserve_interword_spaces: "1" });
    const pages: PdfPage[] = [];
    for (const img of images) {
      const { data } = await worker.recognize(Buffer.from(await enhanceForOcr(img.png)));
      pages.push({ num: img.num, text: repairOcrNumbers(data.text) });
    }
    return pages;
  } finally {
    await worker.terminate();
  }
}
