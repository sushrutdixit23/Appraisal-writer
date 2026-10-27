// Real-browser checks of the Sentinel pages against the seeded fake backend.
//
//   1. node scripts/test-sentinel.mjs                       (compiles the fake and the fixtures)
//   2. node tests/sentinel/e2e/serve-fake.cjs 4010 &         (fake Supabase + model, seeded, RLS on)
//   3. NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4010 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon \
//      SUPABASE_SERVICE_ROLE_KEY=service-role-key ANTHROPIC_API_KEY=k ANTHROPIC_BASE_URL=http://127.0.0.1:4010 \
//      npx next dev -p 3100 &
//   4. node tests/sentinel/e2e/browser.cjs                  (needs Playwright's Chromium)
//
// Two people are signed in by planting a session in the browser's storage: A owns Alpha Tyres and Lakh
// Industries, B owns Bravo Secret Tyres, and three reference companies are public.

const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const IDS = require("./ids.json");
const root = path.join(__dirname, "..", "..", "..");
const { makePdf, ANNUAL_REPORT_PAGES } = require(path.join(root, "node_modules/.cache/sentinel-tests/tests/sentinel/pdf-fixtures.js"));

const BASE = process.env.BASE_URL || "http://127.0.0.1:3100";
const API = process.env.FAKE_URL || "http://127.0.0.1:4010";
const SHOTS = process.env.SHOTS_DIR || fs.mkdtempSync(path.join(os.tmpdir(), "sentinel-e2e-"));
fs.mkdirSync(SHOTS, { recursive: true });

async function db(table, query = "") {
  const res = await fetch(`${API}/rest/v1/${table}?select=*${query}`, { headers: { Authorization: "Bearer service-role-key" } });
  return res.json();
}

async function session(browser, token, userId, email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    access_token: token, token_type: "bearer", expires_in: 31536000, expires_at: now + 31536000, refresh_token: "r-" + token,
    user: { id: userId, aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  };
  await ctx.addInitScript(([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, v); } catch (e) {} }, ["zyntask-engage-session", JSON.stringify(payload)]);
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  return { ctx, page };
}

const results = [];
async function check(name, fn, page) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log("PASS  " + name);
  } catch (e) {
    results.push({ name, ok: false, err: String(e.message || e).split("\n").slice(0, 3).join(" | ") });
    console.log("FAIL  " + name + "\n      " + String(e.message || e).split("\n").slice(0, 4).join("\n      "));
    if (page) await page.screenshot({ path: path.join(SHOTS, name.replace(/[^a-z0-9]+/gi, "_").slice(0, 60) + ".png"), fullPage: true }).catch(() => {});
  }
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const field = (page, label) => page.getByLabel(new RegExp("^" + esc(label) + "( \\*)?( \\(verify\\))?$"));
async function fill(page, label, value) { await field(page, label).fill(value); }
async function stat(page, label) {
  const lab = page.locator("p", { hasText: new RegExp("^" + esc(label) + "$") }).first();
  return (await lab.locator("xpath=following-sibling::p[1]").textContent()).trim();
}
async function options(page, selector) { return page.locator(selector + " option").allTextContents(); }
async function ready(page, url, waitFor) {
  await page.goto(BASE + url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(waitFor, { timeout: 60000 });
  // Server-rendered markup appears before React has attached handlers; wait for the page's own requests
  // to settle so a click is not lost to a half-hydrated page.
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(400);
}

(async () => {
  const browser = await chromium.launch();
  const A = await session(browser, "tok-a", IDS.A, "a@example.com");
  const B = await session(browser, "tok-b", IDS.B, "b@example.com");
  const a = A.page, b = B.page;

  // ------------------------------------------------------------------------------- access
  await check("access: A's company picker lists A's companies first, then reference companies, and never B's", async () => {
    await ready(a, "/sentinel/kpi", 'select[aria-label="Company"]');
    const opts = await options(a, 'select[aria-label="Company"]');
    assert.deepEqual(opts, ["Alpha Tyres", "Lakh Industries", "Apex Reference Tyres (reference)", "Meridian Reference Tyres (reference)", "Zenith Reference Tyres (reference)"]);
  }, a);

  await check("access: B sees B's company and the reference companies, never A's", async () => {
    await ready(b, "/sentinel/kpi", 'select[aria-label="Company"]');
    const opts = await options(b, 'select[aria-label="Company"]');
    assert.deepEqual(opts, ["Bravo Secret Tyres", "Apex Reference Tyres (reference)", "Meridian Reference Tyres (reference)", "Zenith Reference Tyres (reference)"]);
  }, b);

  await check("access: the company you pick follows you to the other pages (and into the address bar)", async () => {
    await ready(a, "/sentinel/kpi", 'select[aria-label="Company"]');
    await a.locator('select[aria-label="Company"]').selectOption({ label: "Meridian Reference Tyres (reference)" });
    assert.match(a.url(), new RegExp("workspace=" + IDS.ref2));
    await a.getByRole("link", { name: "Financial Statements" }).click();
    await a.waitForSelector('select[aria-label="Company"]');
    await a.waitForFunction((id) => document.querySelector('select[aria-label="Company"]').value === id, IDS.ref2);
    await a.getByRole("link", { name: "Deep Analysis" }).click();
    await a.waitForSelector('select[aria-label="Viewing as"]');
    await a.waitForFunction((id) => document.querySelector('select[aria-label="Viewing as"]').value === id, IDS.ref2);
  }, a);

  await check("access: a link carrying ?workspace= opens on that company", async () => {
    await ready(a, "/sentinel/statements?workspace=" + IDS.ref3, 'select[aria-label="Company"]');
    await a.waitForFunction((id) => document.querySelector('select[aria-label="Company"]').value === id, IDS.ref3);
  }, a);

  await check("access: a link to someone else's company id falls back to your own list, it does not show it", async () => {
    await ready(a, "/sentinel/statements?workspace=" + IDS.bravo, 'select[aria-label="Company"]');
    const v = await a.locator('select[aria-label="Company"]').inputValue();
    assert.notEqual(v, IDS.bravo);
    assert.ok(!(await a.content()).includes("Bravo Secret"));
  }, a);

  await check("access: Manage Periods offers only companies you own - no reference companies", async () => {
    await ready(a, "/sentinel/add-period", "#mp-company");
    assert.deepEqual(await options(a, "#mp-company"), ["Alpha Tyres", "Lakh Industries"]);
  }, a);

  await check("access: B's Manage Periods lists only B's company", async () => {
    await ready(b, "/sentinel/add-period", "#mp-company");
    assert.deepEqual(await options(b, "#mp-company"), ["Bravo Secret Tyres"]);
  }, b);

  await check("access: a reference company cannot be written through the API, and B cannot write A's", async () => {
    const stmt = { period_type: "FY", period_label: "HACK", period_end_date: "2030-03-31", basis: "consolidated", revenue_from_operations: 1, profit_before_tax: 1, profit_after_tax: 1 };
    const post = async (token, workspace_id) =>
      (await fetch(BASE + "/api/sentinel/statement", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ workspace_id, statement: stmt }) })).status;
    assert.equal(await post("tok-a", IDS.ref1), 403);
    assert.equal(await post("tok-b", IDS.alpha), 404);
    assert.equal(await post("nope", IDS.alpha), 401);
    assert.equal((await db("sentinel_statements", "&period_label=eq.HACK")).length, 0);
  });

  // ------------------------------------------------------------------------------- calculations on screen
  await check("KPI: Alpha's figures match the hand calculation", async () => {
    await ready(a, "/sentinel/kpi?workspace=" + IDS.alpha, 'select[aria-label="Company"]');
    await a.waitForSelector("text=Key figures");
    // Alpha FY26: revenue 1300, EBITDA 260, PAT 100, PBT 130; FY25: revenue 1000, PAT 80.
    // current assets 500 / current liabilities 400; debt 300 / equity 600; inventory 100, expenses 1150; receivables 120.
    assert.equal(await stat(a, "EBITDA margin"), "20.0%"); // 260 / 1300
    assert.equal(await stat(a, "PAT margin"), "7.7%"); // 100 / 1300
    assert.equal(await stat(a, "Revenue YoY"), "30.0%"); // (1300 - 1000) / 1000
    assert.equal(await stat(a, "PAT YoY"), "25.0%"); // (100 - 80) / 80
    assert.equal(await stat(a, "Current ratio"), "1.25x"); // 500 / 400
    assert.equal(await stat(a, "Debt-to-equity"), "0.50x"); // 300 / 600
    assert.equal(await stat(a, "Inventory days"), "32d"); // 100 / 1150 * 365 = 31.7
    assert.equal(await stat(a, "Receivable days"), "34d"); // 120 / 1300 * 365 = 33.7
  }, a);

  await check("KPI: rank and percentile count only the peers A is allowed to see (4 companies, not 5)", async () => {
    // Revenue: Meridian 2000 > Alpha 1300 > Apex 1250 > Zenith 800 -> rank 2 of 4; ahead of 2 of 3 peers = 66.7 -> 67th.
    assert.equal(await stat(a, "Rank"), "2 of 4");
    assert.equal(await stat(a, "Percentile"), "67th");
    assert.ok(!(await a.content()).includes("Bravo"));
  }, a);

  await check("KPI: B's view of the same sector includes Bravo and never Alpha", async () => {
    await ready(b, "/sentinel/kpi?workspace=" + IDS.bravo, 'select[aria-label="Company"]');
    await b.waitForSelector("text=Key figures");
    assert.equal(await stat(b, "Rank"), "1 of 4");
    assert.ok(!(await b.content()).includes("Alpha Tyres"));
  }, b);

  await check("Statements: YoY compares the latest year with the prior year, labelled", async () => {
    await ready(a, "/sentinel/statements?workspace=" + IDS.alpha, 'select[aria-label="Company"]');
    await a.waitForSelector("text=YoY % (FY26 vs FY25)");
    const row = a.locator("tr", { hasText: "Revenue from Operations" }).first();
    assert.match(await row.textContent(), /\+30\.0%/);
  }, a);

  await check("Executive: reviewed / approved / awaiting are counted from the findings", async () => {
    await ready(a, "/sentinel/executive", "text=Approved findings only");
    assert.equal(await stat(a, "Reviewed"), "2"); // approved + rejected
    assert.equal(await stat(a, "Approved"), "1");
    assert.equal(await stat(a, "Awaiting review"), "1"); // the pending draft
  }, a);

  await check("Export: the PDF download works from the dashboard and is a real PDF", async () => {
    await ready(a, "/sentinel/kpi?workspace=" + IDS.alpha, 'select[aria-label="Company"]');
    await a.waitForSelector("text=Key figures");
    const [download] = await Promise.all([a.waitForEvent("download", { timeout: 120000 }), a.getByRole("button", { name: "Export PDF" }).click()]);
    const file = await download.path();
    assert.equal(fs.readFileSync(file).subarray(0, 4).toString(), "%PDF");
    // The page names the download itself (company name + MIS_Pack); the server header carries the period.
    assert.match(download.suggestedFilename(), /^Alpha_Tyres_MIS_Pack\.pdf$/);
  }, a);

  await check("Queue: generating a draft for a flagged company saves it for the caller", async () => {
    await ready(a, "/sentinel", "text=Investigation Queue");
    await a.waitForSelector("text=Alpha Tyres");
    const before = (await db("sentinel_investigations")).length;
    const gen = a.getByRole("button", { name: /Generate/i }).first();
    await gen.click();
    await a.waitForFunction(async (n) => (await (await fetch("http://127.0.0.1:4010/rest/v1/sentinel_investigations?select=id", { headers: { Authorization: "Bearer service-role-key" } })).json()).length > n, before, { timeout: 60000 });
    const rows = await db("sentinel_investigations");
    assert.ok(rows.every((r) => r.owner_id === IDS.A || r.owner_id === IDS.B));
    assert.ok(!JSON.stringify(rows).includes("Bravo"));
  }, a);

  // ------------------------------------------------------------------------------- manage periods
  await check("Manage Periods: every field is on the form, including the cash-flow inputs that used to be missing", async () => {
    await ready(a, "/sentinel/add-period", "#mp-company");
    await a.locator("#mp-company").selectOption({ label: "Alpha Tyres" });
    for (const label of ["Revenue from operations", "Total assets", "Fixed assets", "Cash & equivalents", "Total liabilities", "Cash from operations", "Cash from investing", "Cash from financing", "Capital expenditure"]) {
      assert.equal(await field(a, label).count(), 1, label);
    }
  }, a);

  await check("Manage Periods: pasted figures with commas and brackets save as numbers; the new period shows up without a reload", async () => {
    await a.locator("#mp-plabel").fill("FY27");
    await a.locator("#mp-pend").fill("2027-03-31");
    await fill(a, "Revenue from operations", "1,500.5");
    await fill(a, "Profit before tax", "150");
    await fill(a, "Profit after tax", "110");
    await fill(a, "Cash from operations", "140");
    await fill(a, "Cash from investing", "(210)");
    await a.getByRole("button", { name: "Save new period" }).click();
    await a.waitForSelector("text=Period added.");
    const [row] = await db("sentinel_statements", "&period_label=eq.FY27&workspace_id=eq." + IDS.alpha);
    assert.equal(row.revenue_from_operations, 1500.5);
    assert.equal(row.cash_from_operations, 140);
    assert.equal(row.cash_from_investing, -210);
    assert.equal(row.basis, "consolidated");
    await a.getByRole("button", { name: "Back to Manage Periods" }).click();
    assert.ok((await options(a, "#mp-period")).includes("FY27 (FY, consolidated)"));
  }, a);

  await check("Manage Periods: editing a period you just saved shows what was saved, and an update sticks", async () => {
    await a.locator("#mp-period").selectOption({ label: "FY27 (FY, consolidated)" });
    assert.equal(await field(a, "Revenue from operations").inputValue(), "1500.5");
    assert.equal(await field(a, "Cash from investing").inputValue(), "-210");
    await fill(a, "Revenue from operations", "1,600");
    await a.getByRole("button", { name: "Update period" }).click();
    await a.waitForSelector("text=Period updated.");
    await a.getByRole("button", { name: "Back to Manage Periods" }).click();
    await a.locator("#mp-period").selectOption({ label: "FY27 (FY, consolidated)" });
    assert.equal(await field(a, "Revenue from operations").inputValue(), "1600"); // not the stale 1500.5
    const rows = await db("sentinel_statements", "&period_label=eq.FY27&workspace_id=eq." + IDS.alpha);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].revenue_from_operations, 1600);
  }, a);

  await check("Manage Periods: saving the same label and basis again is refused with a pointer to edit it", async () => {
    await a.locator("#mp-period").selectOption("new");
    await a.locator("#mp-plabel").fill("FY27");
    await a.locator("#mp-pend").fill("2027-03-31");
    await fill(a, "Revenue from operations", "1000");
    await fill(a, "Profit before tax", "100");
    await fill(a, "Profit after tax", "80");
    await a.getByRole("button", { name: "Save new period" }).click();
    await a.waitForSelector('[role="alert"]:has-text("already exists")');
    assert.equal((await db("sentinel_statements", "&period_label=eq.FY27&workspace_id=eq." + IDS.alpha)).length, 1);
  }, a);

  await check("Manage Periods: text that is not a number is an error on the field, not a silent blank", async () => {
    await a.locator("#mp-plabel").fill("FY28");
    await a.locator("#mp-pend").fill("2028-03-31");
    await fill(a, "Revenue from operations", "abc");
    await a.getByRole("button", { name: "Save new period" }).click();
    await a.waitForSelector('[role="alert"]:has-text("Revenue from operations is not a number")');
    assert.equal(await field(a, "Revenue from operations").getAttribute("aria-invalid"), "true");
  }, a);

  await check("Manage Periods: an unbalanced balance sheet is refused and names the fields", async () => {
    await fill(a, "Revenue from operations", "1000");
    await fill(a, "Total assets", "600");
    await fill(a, "Total liabilities", "350");
    await fill(a, "Total equity", "200");
    await a.getByRole("button", { name: "Save new period" }).click();
    await a.waitForSelector('[role="alert"]:has-text("Balance sheet does not balance")');
    assert.equal(await field(a, "Total assets").getAttribute("aria-invalid"), "true");
    assert.equal((await db("sentinel_statements", "&period_label=eq.FY28&workspace_id=eq." + IDS.alpha)).length, 0);
  }, a);

  await check("Manage Periods: negative equity saves with a warning, and a second basis is a separate statement", async () => {
    await fill(a, "Total assets", "");
    await fill(a, "Total liabilities", "");
    await fill(a, "Total equity", "-40");
    await a.getByRole("button", { name: "Save new period" }).click();
    await a.waitForSelector("text=Total equity is negative");
    const [row] = await db("sentinel_statements", "&period_label=eq.FY28&workspace_id=eq." + IDS.alpha);
    assert.equal(row.total_equity, -40);
    await a.getByRole("button", { name: "Back to Manage Periods" }).click();
    await a.locator("#mp-period").selectOption("new");
    await a.locator("#mp-plabel").fill("FY28");
    await a.locator("#mp-pend").fill("2028-03-31");
    await a.locator("#mp-pbasis").selectOption("standalone");
    await fill(a, "Revenue from operations", "900");
    await fill(a, "Profit before tax", "90");
    await fill(a, "Profit after tax", "70");
    await a.getByRole("button", { name: "Save new period" }).click();
    await a.waitForSelector("text=Period added.");
    const rows = await db("sentinel_statements", "&period_label=eq.FY28&workspace_id=eq." + IDS.alpha);
    assert.deepEqual(rows.map((r) => r.basis).sort(), ["consolidated", "standalone"]);
  }, a);

  await check("Manage Periods: deleting a period removes it from the list straight away", async () => {
    await a.getByRole("button", { name: "Back to Manage Periods" }).click();
    await a.locator("#mp-period").selectOption({ label: "FY28 (FY, standalone)" });
    await a.getByRole("button", { name: "Delete this period" }).click();
    await a.getByRole("button", { name: "Yes, delete" }).click();
    await a.waitForFunction(() => ![...document.querySelectorAll("#mp-period option")].some((o) => o.textContent.includes("FY28 (FY, standalone)")));
    assert.equal((await db("sentinel_statements", "&period_label=eq.FY28&basis=eq.standalone&workspace_id=eq." + IDS.alpha)).length, 0);
  }, a);

  // ------------------------------------------------------------------------------- new project + PDF extraction
  const pdfPath = path.join(SHOTS, "annual-report.pdf");
  fs.writeFileSync(pdfPath, await makePdf(ANNUAL_REPORT_PAGES));

  await check("New Project: leaving halfway creates no company", async () => {
    const before = (await db("sentinel_workspaces")).length;
    await ready(a, "/sentinel/new-project", "#np-name");
    await a.locator("#np-name").fill("Abandoned Co");
    await a.getByRole("button", { name: "Continue" }).click();
    await a.waitForSelector("#np-plabel");
    await a.goto(BASE + "/sentinel/home", { waitUntil: "domcontentloaded" });
    assert.equal((await db("sentinel_workspaces")).length, before);
  }, a);

  await check("New Project: a refused first statement creates no company either", async () => {
    const before = (await db("sentinel_workspaces")).length;
    await ready(a, "/sentinel/new-project", "#np-name");
    await a.locator("#np-name").fill("Refused Co");
    await a.getByRole("button", { name: "Continue" }).click();
    await a.waitForSelector("#np-plabel");
    await a.locator("#np-plabel").fill("FY26");
    await a.locator("#np-pend").fill("2026-03-31");
    await fill(a, "Revenue from operations", "1000");
    await fill(a, "Profit before tax", "100");
    await fill(a, "Profit after tax", "80");
    await fill(a, "Inventory", "-5");
    await a.getByRole("button", { name: "Save & finish" }).click();
    await a.waitForSelector('[role="alert"]:has-text("Inventory cannot be negative")');
    assert.equal((await db("sentinel_workspaces")).length, before);
  }, a);

  await check("PDF upload: a real PDF fills the form, converted from crore to the company's lakh, with doubtful figures marked", async () => {
    await ready(a, "/sentinel/new-project", "#np-name");
    await a.locator("#np-name").fill("Pyxis Lakh Co");
    await a.locator("#np-sector").selectOption("tyre");
    await a.locator("#np-unit").selectOption("INR_LAKH");
    await a.getByRole("button", { name: "Continue" }).click();
    await a.waitForSelector("#sentinel-extract-file");
    await a.setInputFiles("#sentinel-extract-file", pdfPath);
    await a.waitForSelector("text=Read statement pages", { timeout: 60000 });
    const body = await a.locator("body").innerText();
    assert.match(body, /Read statement pages: 4, 5, 6\./);
    assert.match(body, /figures were converted to .*Lakh/);
    // 1,000 crore = 1,00,000 lakh. The model reported crore; the company reports lakh.
    assert.equal(await field(a, "Revenue from operations").inputValue(), "100000");
    assert.equal(await field(a, "Profit after tax").inputValue(), "9000");
    assert.equal(await field(a, "Cash from operations").inputValue(), "14000");
    assert.equal(await field(a, "Cash from investing").inputValue(), "-21000");
    assert.equal(await a.locator("#np-plabel").inputValue(), "FY26");
    assert.equal(await a.locator("#np-pend").inputValue(), "2026-03-31");
    assert.equal(await a.locator("#np-pbasis").inputValue(), "consolidated");
    // total_debt (400, summed by the model) and EBITDA (never printed) are marked; a printed figure is not.
    assert.equal(await a.getByLabel(/^Total debt \(verify\)$/).count(), 1);
    assert.equal(await a.getByLabel(/^EBITDA \(verify\)$/).count(), 1);
    assert.equal(await a.getByLabel(/^Total assets$/).count(), 1);
  }, a);

  await check("PDF upload: saving the reviewed draft stores it in the company's unit on the right basis", async () => {
    await a.getByRole("button", { name: "Save & finish" }).click();
    await a.waitForSelector("text=Pyxis Lakh Co is set up.");
    const [ws] = await db("sentinel_workspaces", "&company_name=eq.Pyxis%20Lakh%20Co");
    assert.equal(ws.owner_id, IDS.A);
    assert.equal(ws.currency_unit, "INR_LAKH");
    const [s] = await db("sentinel_statements", "&workspace_id=eq." + ws.id);
    assert.equal(s.revenue_from_operations, 100000);
    assert.equal(s.cash_from_operations, 14000);
    assert.equal(s.basis, "consolidated");
    assert.equal(s.source_file, "annual-report.pdf");
  }, a);

  await check("PDF upload: a scanned (text-less) PDF is refused on the page with the reason", async () => {
    const { makeBlankPdf } = require(path.join(root, "node_modules/.cache/sentinel-tests/tests/sentinel/pdf-fixtures.js"));
    const blank = path.join(SHOTS, "scanned.pdf");
    fs.writeFileSync(blank, await makeBlankPdf(3));
    await ready(a, "/sentinel/add-period", "#mp-company");
    await a.locator("#mp-company").selectOption({ label: "Alpha Tyres" });
    await a.setInputFiles("#sentinel-extract-file", blank);
    await a.waitForSelector('[role="alert"]:has-text("scanned or image-based")', { timeout: 60000 });
  }, a);

  await check("Company units: a lakh company and a crore company line up in the peer table (Pyxis 100000 lakh = 1000 crore)", async () => {
    await ready(a, "/sentinel/kpi", 'select[aria-label="Company"]');
    await a.locator('select[aria-label="Company"]').selectOption({ label: "Pyxis Lakh Co" });
    await a.waitForSelector("text=Key figures");
    // Shown in crore on the dashboard: 1,000 (not 100,000).
    const revenueTile = await a.locator("p", { hasText: /^Revenue \(latest FY, .* crore\)$/ }).first().locator("xpath=following-sibling::p[1]").textContent();
    assert.equal(revenueTile.trim(), "1,000");
  }, a);

  // ------------------------------------------------------------------------------- data entry (server-validated path)
  await check("Data Entry: picks from your own companies and saves through the server", async () => {
    await ready(a, "/sentinel/data-entry", "#de-name");
    await a.getByLabel("Add period to a company").check();
    await a.waitForSelector("#de-existing");
    const opts = await options(a, "#de-existing");
    assert.ok(opts.includes("Alpha Tyres") && !opts.some((o) => o.includes("Bravo") || o.includes("Reference")));
    await a.locator("#de-existing").selectOption({ label: "Alpha Tyres" });
    await a.locator("#de-plabel").fill("FY29");
    await a.locator("#de-pend").fill("2029-03-31");
    await fill(a, "Revenue from operations", "1,700");
    await fill(a, "Profit before tax", "170");
    await fill(a, "Profit after tax", "120");
    await a.getByRole("button", { name: "Save period" }).click();
    await a.waitForSelector("text=Saved (created).");
    const [row] = await db("sentinel_statements", "&period_label=eq.FY29&workspace_id=eq." + IDS.alpha);
    assert.equal(row.revenue_from_operations, 1700);
  }, a);

  // ------------------------------------------------------------------------------- console health
  await check("no uncaught page errors on any page visited", async () => {
    assert.deepEqual([...a.errors, ...b.errors], []);
  });

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} browser checks passed. Screenshots of failures: ${SHOTS}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error("E2E ERROR", e); process.exit(2); });
