// /api/sentinel/ocr: a scanned PDF - pictures only, no text - is read through Tesseract and the same rules reader, and
// every figure that comes out of it is marked for review. The text reader alone refuses the same file.

import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { POST } from "../../app/api/sentinel/ocr/route";
import { parsePageRange } from "../../app/sentinel/lib/ocr";
import { readFileToResult, ReadFileError } from "../../app/sentinel/lib/autofill/readFile";
import { resetRateLimits } from "../../app/sentinel/lib/server";
import { FakeBackend, useBackend } from "./fake-backend";
import { makeScannedPdf } from "./scan-fixtures";

const A = randomUUID();
const backend = new FakeBackend();
let scanned: Buffer;

before(async () => {
  await backend.start();
  useBackend(backend);
  backend.addUser("tok-a", A);
  scanned = await makeScannedPdf();
});
after(() => backend.stop());
beforeEach(() => resetRateLimits());

async function call(file: Buffer | null, pages: string, token: string | null = "tok-a") {
  const form = new FormData();
  if (file) form.append("file", new File([new Uint8Array(file)], "scan.pdf", { type: "application/pdf" }));
  form.append("pages", pages);
  const res = await POST(new Request("http://localhost/api/sentinel/ocr", { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body: form }));
  return { status: res.status, json: (await res.json()) as any };
}

test("page ranges: lists and ranges become sorted unique pages; nonsense and over-long ranges say why", () => {
  assert.deepEqual(parsePageRange("5, 7, 9-11, 7"), [5, 7, 9, 10, 11]);
  assert.deepEqual(parsePageRange("140-142"), [140, 141, 142]);
  for (const bad of ["", "abc", "0-3", "9-3", "1-500"]) assert.ok("error" in (parsePageRange(bad) as object), bad);
});

test("the plain text reader refuses a scanned PDF - that is the gap OCR fills", async () => {
  await assert.rejects(() => readFileToResult(scanned, "scan.pdf", "application/pdf", {}), (e: unknown) => e instanceof ReadFileError && e.status === 422);
});

test("a scanned filing's statement pages are recognised and read into figures, all marked for review", async () => {
  const r = await call(scanned, "1-2");
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const fy26 = r.json.periods.find((p: any) => p.period_label === "FY26");
  assert.ok(fy26, "the FY26 column was found: " + JSON.stringify(r.json.periods.map((p: any) => p.period_label)));
  assert.equal(fy26.fields.revenue_from_operations.value, 1000);
  assert.equal(fy26.fields.profit_before_tax.value, 150);
  assert.equal(fy26.fields.total_assets.value, 2000);
  assert.equal(fy26.fields.total_equity.value, 1100);
  assert.ok(Object.values(fy26.fields).every((h: any) => h.confidence === "low"), "OCR output must never be marked trustworthy");
  assert.match(r.json.notes[0], /scanned images by OCR/);
});

test("OCR refuses: no login, no pages, a bad range, a file that is not a PDF, and pages that are not in the file", async () => {
  assert.equal((await call(scanned, "1-2", null)).status, 401);
  assert.equal((await call(scanned, "")).status, 400);
  assert.equal((await call(scanned, "2-1")).status, 400);
  assert.equal((await call(Buffer.from("not a pdf"), "1")).status, 400);
  assert.equal((await call(null, "1")).status, 400);
  assert.equal((await call(scanned, "40-41")).status, 400);
});
