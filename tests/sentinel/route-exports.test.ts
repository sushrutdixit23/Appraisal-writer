// The three exports (Excel, PDF, PowerPoint) share one access check. These run the real route handlers
// against the fake backend and open the files they produce.

import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { POST as xlsx } from "../../app/api/sentinel/export/xlsx/route";
import { POST as pdf } from "../../app/api/sentinel/export/pdf/route";
import { POST as pptx } from "../../app/api/sentinel/export/pptx/route";
import { loadExportContext, isFailure } from "../../app/sentinel/lib/server";
import { FakeBackend, useBackend } from "./fake-backend";

const A = randomUUID();
const B = randomUUID();
const backend = new FakeBackend();
let wsA = "", wsB = "", wsRef = "";

before(async () => {
  await backend.start();
  useBackend(backend);
  backend.addUser("tok-a", A);
  backend.addUser("tok-b", B);
});
after(() => backend.stop());

const fy = (workspace_id: string, label: string, end: string, revenue: number, pat: number, extra: Record<string, unknown> = {}) => ({
  id: randomUUID(), workspace_id, review_cycle_id: null, period_type: "FY", period_label: label, period_end_date: end, basis: "consolidated",
  revenue_from_operations: revenue, ebitda: revenue * 0.2, profit_before_tax: pat * 1.3, profit_after_tax: pat, source_file: "t", ...extra,
});

beforeEach(() => {
  backend.tables = {};
  wsA = randomUUID(); wsB = randomUUID(); wsRef = randomUUID();
  const base = { sector: "tyre", industry: null, fiscal_year_start_month: 4, currency: "INR", comparison_basis: "consolidated", currency_unit: "INR_CRORE" };
  backend.tables.sentinel_workspaces = [
    { id: wsA, owner_id: A, company_name: 'Alpha "India" Ltd\r\nX-Injected: 1', is_public_reference: false, ...base },
    { id: wsB, owner_id: B, company_name: "Bravo Secret Tyres", is_public_reference: false, ...base },
    { id: wsRef, owner_id: null, company_name: "Reference Tyres", is_public_reference: true, ...base },
  ];
  backend.tables.sentinel_statements = [
    fy(wsA, "FY26", "2026-03-31", 1200, 100), fy(wsA, "FY25", "2025-03-31", 1000, 90),
    fy(wsRef, "FY26", "2026-03-31", 1100, 95), fy(wsRef, "FY25", "2025-03-31", 1000, 85),
    fy(wsB, "FY26", "2026-03-31", 1150, 99), fy(wsB, "FY25", "2025-03-31", 1000, 80),
  ];
  const inv = (workspace_id: string, owner_id: string, text: string) => ({
    id: randomUUID(), workspace_id, owner_id, period_label: "FY26", status: "pending", ai_narrative: text, final_narrative: null,
    confidence_score: 60, observation: [], named_peer: null,
  });
  backend.tables.sentinel_investigations = [inv(wsRef, A, "A's own draft"), inv(wsRef, B, "B's private draft")];
});

const req = (body: unknown, token: string | null = "tok-a") =>
  new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

for (const [name, handler] of [["xlsx", xlsx], ["pdf", pdf], ["pptx", pptx]] as const) {
  test(`${name}: no token is a 401, and another user's company is a 404`, async () => {
    assert.equal((await handler(req({ workspace_id: wsA }, null))).status, 401);
    assert.equal((await handler(req({ workspace_id: wsB }, "tok-a"))).status, 404);
    assert.equal((await handler(req({ workspace_id: "nope" }))).status, 404);
    assert.equal((await handler(req({}))).status, 400);
  });

  test(`${name}: the owner gets a file, with a header-safe filename whatever the company is called`, async () => {
    const res = await handler(req({ workspace_id: wsA }));
    assert.equal(res.status, 200);
    const disposition = res.headers.get("content-disposition") ?? "";
    assert.match(disposition, /^attachment; filename="[A-Za-z0-9_.-]+"$/);
    assert.ok(!/[\r\n]/.test(disposition));
    assert.equal(res.headers.get("x-injected"), null);
    const bytes = Buffer.from(await res.arrayBuffer());
    assert.ok(bytes.length > 1000);
    if (name === "pdf") assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
    else assert.equal(bytes.subarray(0, 2).toString(), "PK"); // an OOXML zip
  });

  test(`${name}: a period other than the latest is refused instead of mixing periods`, async () => {
    const res = await handler(req({ workspace_id: wsA, period_label: "FY25" }));
    assert.equal(res.status, 400);
    assert.match(((await res.json()) as any).error, /latest annual period \(FY26\)/);
  });
}

test("a reference company can be exported by anyone", async () => {
  assert.equal((await xlsx(req({ workspace_id: wsRef }, "tok-b"))).status, 200);
});

async function sheetOf(workspace_id: string, token = "tok-a") {
  const res = await xlsx(req({ workspace_id }, token));
  assert.equal(res.status, 200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as any);
  return wb.getWorksheet("Income Statement")!;
}

test("excel: figures are the stored ones, the YoY column names its periods, margins are live formulas", async () => {
  const sheet = await sheetOf(wsA);
  const header = (sheet.getRow(1).values as any[]).filter(Boolean).join(" | ");
  assert.match(header, /FY25 \(consolidated\)/);
  assert.match(header, /FY26 \(consolidated\)/);
  assert.match(header, /YoY % \(FY26 vs FY25\)/);
  const revenueRow = sheet.getRow(2);
  assert.equal(revenueRow.getCell(1).value, "Revenue from Operations");
  assert.equal(revenueRow.getCell(2).value, 1000); // FY25 first (oldest left)
  assert.equal(revenueRow.getCell(3).value, 1200);
  const yoy = revenueRow.getCell(4).value as any;
  assert.match(yoy.formula, /\(C2-B2\)\/ABS\(B2\)/); // (FY26 - FY25) / |FY25|
  const marginRow = [...Array(sheet.rowCount).keys()].map((i) => sheet.getRow(i + 1)).find((r) => r.getCell(1).value === "EBITDA Margin")!;
  assert.match((marginRow.getCell(3).value as any).formula, /C6\/C2/);
});

test("excel: peer notes name only companies the caller may see", async () => {
  const sheet = await sheetOf(wsA);
  const text = JSON.stringify(sheet.getSheetValues());
  assert.ok(!text.includes("Bravo"), "another tenant's private company leaked into the workbook");
  assert.match(text, /vs Reference Tyres/);
});

test("excel: the YoY column is left out when the last two columns are not consecutive years", async () => {
  backend.tables.sentinel_statements = backend.rowsOf("sentinel_statements").filter((s) => !(s.workspace_id === wsA && s.period_label === "FY25"));
  backend.rowsOf("sentinel_statements").push(fy(wsA, "FY23", "2023-03-31", 800, 70));
  const sheet = await sheetOf(wsA);
  const header = (sheet.getRow(1).values as any[]).filter(Boolean).join(" | ");
  assert.ok(!/YoY/.test(header), header);
});

test("exports only ever load the CALLER'S investigations, never another user's drafts on a shared company", async () => {
  const ctx = await loadExportContext(req({ workspace_id: wsRef }, "tok-a"), { investigations: true });
  assert.ok(!isFailure(ctx));
  assert.deepEqual((ctx as any).investigations.map((i: any) => i.ai_narrative), ["A's own draft"]);
  const other = await loadExportContext(req({ workspace_id: wsRef }, "tok-b"), { investigations: true });
  assert.deepEqual((other as any).investigations.map((i: any) => i.ai_narrative), ["B's private draft"]);
});
