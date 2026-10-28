// What a real scanned annual report taught the OCR path. The text below is what Tesseract returned for three pages of
// Infosys's standalone statements (Annual Report 2025-26, pp. 207-209, scanned at 170 dpi): the note column is printed
// "2.3", "2.8", "2.18" or "2.1, 2.3" (read as "21,23"), and the year header is "As at March 31," over a bare "2026  2025",
// which reads as ONE date. Expected figures are the filing's own, checked against the hand-verified CSV.

import test from "node:test";
import assert from "node:assert/strict";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { autofillFromPdfPages } from "../../app/sentinel/lib/autofill/pdf";
import { enhanceForOcr } from "../../app/sentinel/lib/ocr";

const BALANCE_SHEET = `Standalone Balance Sheet
(In crore)
Particulars                                                   Note                     As at March 31,
2026                                  2025
Assets
Property, plant and equipment                                 2.3                        10,774                    10,070
Right-of-use assets                                           23                         2,851                     3,078
Total non-current assets                                                                 46,260                    47,768
Trade receivables                                             2.8                        30,337                    26,413
Cash and cash equivalents                                     29                         8,727                    14,265
Total current assets                                                                     80,431                    77,168
Total assets                                                                             1,26,691                  1,24,936
Equity
Total equity                                                                             80,874                    87,332
Total current liabilities                                                                39,637                    31,762
Total liabilities                                                                        45,817                    37,604
`;

const PROFIT_AND_LOSS = `Standalone Statement of Profit and Loss
(In crore, except equity share and per equity share data)
Particulars                                                   Note                     Year ended March 31,
2026                                  2025
Revenue from operations                                       218                        1,48,819                  1,36,592
Other income, net                                             2.19                       6,491                     4,782
Total income                                                                             1,55,310                  1,41,374
Depreciation and amortization expenses                        21,23                      2,394                     2,619
Finance cost                                                                             207                       221
Profit before tax                                                                        38,757                    35,441
Profit for the year                                                                      29,211                    25,568
`;

const val = (r: ReturnType<typeof autofillFromPdfPages>, label: string, field: string) =>
  (r.periods.find((p) => p.period_label === label)!.fields as Record<string, { value: number }>)[field]?.value;

test("a balance sheet whose header reads as one date over two years, with dotted note numbers, reads both years - not the note as a figure", () => {
  const r = autofillFromPdfPages([{ num: 1, text: BALANCE_SHEET }], {});
  assert.deepEqual(r.periods.map((p) => p.period_label).sort(), ["FY25", "FY26"]);
  assert.equal(val(r, "FY26", "trade_receivables"), 30_337); // not 2.8
  assert.equal(val(r, "FY25", "trade_receivables"), 26_413);
  assert.equal(val(r, "FY26", "fixed_assets"), 10_774); // not 2.3
  assert.equal(val(r, "FY25", "cash_and_equivalents"), 14_265);
  assert.equal(val(r, "FY26", "total_assets"), 126_691);
  assert.equal(val(r, "FY25", "total_liabilities"), 37_604);
});

test("a profit and loss with a note cell OCR turned into '21,23' reads the amounts that follow it, current year first", () => {
  const r = autofillFromPdfPages([{ num: 3, text: PROFIT_AND_LOSS }], {});
  assert.equal(val(r, "FY26", "revenue_from_operations"), 148_819);
  assert.equal(val(r, "FY25", "revenue_from_operations"), 136_592);
  assert.equal(val(r, "FY26", "depreciation_amortisation"), 2_394);
  assert.equal(val(r, "FY25", "depreciation_amortisation"), 2_619);
  assert.equal(val(r, "FY26", "profit_after_tax"), 29_211);
});

test("a genuine two-figure row is never treated as carrying a note: total income and profit keep both years", () => {
  const text = `Standalone Statement of Profit and Loss
Particulars   Note   Year ended March 31,
2026   2025
Revenue from operations   2.18   1,48,819   1,36,592
Other income, net   2.19   6,491   4,782
Total income   1,55,310   1,41,374
Total expenses   1,15,407   1,05,933
Profit before tax   38,757   35,441
Tax expense   9,546   9,873
Profit for the year   12.50   29,211   25,568
`;
  const r = autofillFromPdfPages([{ num: 1, text }], {});
  assert.equal(val(r, "FY26", "total_income"), 155_310);
  assert.equal(val(r, "FY25", "total_income"), 141_374);
  assert.equal(val(r, "FY26", "total_expenses"), 115_407);
  assert.equal(val(r, "FY25", "profit_before_tax"), 35_441);
});

test("OCR preparation turns light-grey print black and leaves white paper and pale shading white", async () => {
  const canvas = createCanvas(30, 10);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgb(255,255,255)"; ctx.fillRect(0, 0, 30, 10);
  ctx.fillStyle = "rgb(175,175,175)"; ctx.fillRect(0, 0, 10, 10); // the grey a current-year column is printed in
  ctx.fillStyle = "rgb(238,238,238)"; ctx.fillRect(10, 0, 10, 10); // a table header's pale shading
  const out = await enhanceForOcr(canvas.toBuffer("image/png"));
  const img = await loadImage(Buffer.from(out));
  const c2 = createCanvas(30, 10);
  const x2 = c2.getContext("2d");
  x2.drawImage(img, 0, 0);
  const px = (x: number) => Array.from(x2.getImageData(x, 5, 1, 1).data.slice(0, 3));
  assert.deepEqual(px(5), [0, 0, 0]);
  assert.deepEqual(px(15), [255, 255, 255]);
  assert.deepEqual(px(25), [255, 255, 255]);
});
