// A SCANNED filing: pages that are only pictures (drawn with a canvas, embedded as images), so the PDF has no text layer
// at all. Every figure is fake and worked by hand. Used to prove the OCR path reads what a text reader cannot.

import React from "react";
import { createCanvas } from "@napi-rs/canvas";
import { Document, Image, Page, renderToBuffer } from "@react-pdf/renderer";

export const SCANNED_PAGES: string[][] = [
  [
    "Consolidated Statement of Profit and Loss",
    "(Rs. in crore)",
    "Particulars                 Year ended 31 March 2026   Year ended 31 March 2025",
    "Revenue from operations              1,000.00                  900.00",
    "Other income                            50.00                   45.00",
    "Total income                         1,050.00                  945.00",
    "Total expenses                         900.00                  860.00",
    "Profit before tax                      150.00                   85.00",
    "Tax expense                             30.00                   22.00",
    "Profit for the year                    120.00                   63.00",
  ],
  [
    "Consolidated Balance Sheet",
    "(Rs. in crore)",
    "Particulars                       As at 31 March 2026   As at 31 March 2025",
    "Total current assets                       800.00              760.00",
    "Total assets                             2,000.00            1,850.00",
    "Total equity                             1,100.00              980.00",
    "Total current liabilities                  450.00              410.00",
    "Total liabilities                          900.00              870.00",
  ],
];

function pagePng(lines: string[]): Buffer {
  const c = createCanvas(1500, 800);
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 1500, 800);
  g.fillStyle = "#111111";
  g.font = "30px monospace";
  lines.forEach((l, i) => g.fillText(l, 40, 70 + i * 54));
  return c.toBuffer("image/png");
}

/** A PDF whose pages are images only: pdf-parse finds no text in it. */
export async function makeScannedPdf(pages: string[][] = SCANNED_PAGES): Promise<Buffer> {
  const doc = React.createElement(
    Document,
    null,
    ...pages.map((lines, i) =>
      React.createElement(Page, { key: i, size: [750, 400] as [number, number] }, React.createElement(Image, { src: pagePng(lines), style: { width: 750, height: 400 } }))
    )
  );
  return renderToBuffer(doc as never);
}
