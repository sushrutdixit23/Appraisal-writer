// Synthetic filings for the extraction tests. Every figure is FAKE and chosen so the accounting works
// out by hand (see the comments), the way a real annual report's does. The pages mimic the traps a
// real report sets: a table of contents that names every statement, narrative that mentions the
// balance sheet, a standalone set next to the consolidated one, and notes that repeat line items.

import React from "react";
import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";

export const TOC = [
  "Contents",
  "Directors Report ..................................... 12",
  "Consolidated Balance Sheet ........................... 142",
  "Consolidated Statement of Profit and Loss ............ 143",
  "Consolidated Statement of Cash Flows ................. 144",
  "Notes to the Financial Statements .................... 146",
];

export const NARRATIVE = [
  "Directors Report",
  "The Board is pleased to present the annual report together with the audited financial",
  "statements, including the Balance Sheet and the Statement of Profit and Loss for the year.",
  "Revenue grew steadily and the order book remains healthy. Capital expenditure of Rs. 190",
  "crore was incurred during the year. Dividend is recommended subject to approval.",
];

// Standalone: deliberately different numbers, so a mix-up is visible in the output.
export const STANDALONE_PL = [
  "Standalone Statement of Profit and Loss for the year ended 31 March 2026",
  "(Rs. in crore)",
  "Particulars                              Year ended 31 March 2026     Year ended 31 March 2025",
  "Revenue from operations                  700.00                       640.00",
  "Other income                             35.00                        30.00",
  "Total income                             735.00                       670.00",
  "Total expenses                           640.00                       600.00",
  "Finance costs                            12.00                        11.00",
  "Depreciation and amortisation expense    44.00                        41.00",
  "Profit before tax                        95.00                        70.00",
  "Tax expense                              25.00                        18.00",
  "Profit for the year                      70.00                        52.00",
];

// Consolidated P&L. 1,000 + 50 = 1,050 total income; 1,050 - 900 - 30 = 120 PBT; 120 - 30 = 90 PAT.
export const CONSOLIDATED_PL = [
  "Consolidated Statement of Profit and Loss for the year ended 31 March 2026",
  "(Rs. in crore)",
  "Particulars                              Year ended 31 March 2026     Year ended 31 March 2025",
  "Revenue from operations                  1,000.00                     900.00",
  "Other income                             50.00                        45.00",
  "Total income                             1,050.00                     945.00",
  "Total expenses                           900.00                       860.00",
  "Finance costs                            20.00                        22.00",
  "Depreciation and amortisation expense    60.00                        58.00",
  "Profit before exceptional items and tax  150.00                       85.00",
  "Exceptional items                        30.00                        0.00",
  "Profit before tax                        120.00                       85.00",
  "Tax expense                              30.00                        22.00",
  "Profit for the year                      90.00                        63.00",
];

// 2,000 total assets = 900 liabilities + 1,100 equity. Borrowings are split 300 + 100 and no line
// prints their sum, so a "total debt" of 400 would have to be added by the model.
export const CONSOLIDATED_BS = [
  "Consolidated Balance Sheet as at 31 March 2026",
  "(Rs. in crore)",
  "Particulars                              As at 31 March 2026          As at 31 March 2025",
  "Property, plant and equipment            1,100.00                     1,020.00",
  "Inventories                              250.00                       230.00",
  "Trade receivables                        150.00                       140.00",
  "Cash and cash equivalents                90.00                        80.00",
  "Total current assets                     800.00                       760.00",
  "Total assets                             2,000.00                     1,850.00",
  "Total equity                             1,100.00                     980.00",
  "Borrowings (non-current)                 300.00                       320.00",
  "Total non-current liabilities            450.00                       470.00",
  "Borrowings (current)                     100.00                       90.00",
  "Trade payables                           180.00                       170.00",
  "Total current liabilities                450.00                       410.00",
  "Total liabilities                        900.00                       880.00",
];

export const CONSOLIDATED_CF = [
  "Consolidated Statement of Cash Flows for the year ended 31 March 2026",
  "(Rs. in crore)",
  "Net cash generated from operating activities     140.00      120.00",
  "Purchase of property, plant and equipment        (190.00)    (170.00)",
  "Net cash used in investing activities            (210.00)    (150.00)",
  "Net cash from financing activities               60.00       25.00",
];

export const NOTES = [
  "Notes to the Consolidated Financial Statements",
  "Note 12 Trade receivables",
  "Considered good - unsecured                      150.00      140.00",
  "Note 13 Inventories",
  "Raw materials                                    110.00      100.00",
  "Finished goods                                   140.00      130.00",
];

export const ANNUAL_REPORT_PAGES: string[][] = [
  TOC, NARRATIVE, STANDALONE_PL, CONSOLIDATED_BS, CONSOLIDATED_PL, CONSOLIDATED_CF, NOTES,
];

/** Render pages (arrays of lines) as a real text PDF. */
export async function makePdf(pages: string[][]): Promise<Buffer> {
  const doc = React.createElement(
    Document,
    null,
    ...pages.map((lines, i) =>
      React.createElement(
        Page,
        { key: i, size: "A4", style: { padding: 30, fontSize: 9 } },
        ...lines.map((line, j) => React.createElement(Text, { key: j }, line))
      )
    )
  );
  return renderToBuffer(doc as any);
}

/** A PDF whose pages carry no text at all - what a scanned filing looks like to a text reader. */
export async function makeBlankPdf(pageCount = 3): Promise<Buffer> {
  const doc = React.createElement(
    Document,
    null,
    ...Array.from({ length: pageCount }, (_, i) => React.createElement(Page, { key: i, size: "A4" }))
  );
  return renderToBuffer(doc as any);
}
