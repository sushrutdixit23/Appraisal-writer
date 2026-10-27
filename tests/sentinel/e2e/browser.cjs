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
    await a.getByRole("link", { name: "Statements", exact: true }).click();
    await a.waitForSelector('select[aria-label="Company"]');
    await a.waitForFunction((id) => document.querySelector('select[aria-label="Company"]').value === id, IDS.ref2);
    await a.getByRole("link", { name: "Peers and trends", exact: true }).click();
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

  // ------------------------------------------------------------------------------- the project shell
  await check("Projects: A's projects first (with a New project card), then the reference companies, never B's", async () => {
    await ready(a, "/sentinel/projects", '[data-testid="project-card"]');
    const names = await a.locator('[data-testid="project-card"]').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    assert.deepEqual(names, ["Open Alpha Tyres", "Open Lakh Industries", "Open Apex Reference Tyres", "Open Meridian Reference Tyres", "Open Zenith Reference Tyres"]);
    assert.equal(await a.getByRole("link", { name: /New project/ }).count() >= 1, true);
    assert.ok(!(await a.content()).includes("Bravo"));
    // Alpha's card shows its latest year's revenue (1,300 cr) and its pending finding.
    const alpha = await a.locator('[data-testid="project-card"]', { hasText: "Alpha Tyres" }).innerText();
    assert.match(alpha, /FY26 revenue\s*1,300/);
    assert.match(alpha, /1 pending finding/);
  }, a);

  await check("Projects: search narrows the list, and B sees only B's and the references", async () => {
    await a.getByLabel("Search projects").fill("meridian");
    await a.waitForFunction(() => document.querySelectorAll('[data-testid="project-card"]').length === 1);
    await ready(b, "/sentinel/projects", '[data-testid="project-card"]');
    const names = await b.locator('[data-testid="project-card"]').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    assert.deepEqual(names, ["Open Bravo Secret Tyres", "Open Apex Reference Tyres", "Open Meridian Reference Tyres", "Open Zenith Reference Tyres"]);
  }, a);

  await check("Overview: Alpha shows its own figures, its periods and what is still missing", async () => {
    await ready(a, "/sentinel/projects/" + IDS.alpha, '[data-testid="setup-checklist"]');
    assert.equal(await stat(a, "Revenue"), "1,300");
    assert.match(await a.locator('[aria-label="Periods"]').innerText(), /FY26[\s\S]*FY25/);
    // Alpha has a balance sheet, a prior year, findings and an approval; it has no cash flow.
    const list = await a.locator('[data-testid="setup-checklist"]').innerText();
    assert.match(list, /5 of 6 done/);
    assert.match(list, /Add cash flow/);
    assert.ok(!/Add the balance sheet/.test(list.split("Add cash flow")[1] ?? ""));
  }, a);

  await check("Overview: an Edit link opens that exact period in Manage Periods", async () => {
    await a.getByRole("link", { name: "Edit FY25 consolidated" }).click();
    await a.waitForSelector("#mp-period");
    await a.waitForFunction(() => document.querySelector("#mp-period").selectedOptions[0]?.textContent.startsWith("FY25"));
    assert.equal(await field(a, "Revenue from operations").inputValue(), "1000");
  }, a);

  await check("Shell: the side nav follows the project, and a reference company gets only the read pages", async () => {
    await ready(a, "/sentinel/projects/" + IDS.ref1, "h1");
    assert.equal(await a.getByRole("heading", { level: 1 }).innerText(), "Apex Reference Tyres");
    const links = await a.getByRole("navigation", { name: /Apex Reference Tyres pages/ }).getByRole("link").allInnerTexts();
    assert.deepEqual(links, ["Overview", "Statements", "KPIs", "Peers and trends", "Investigations", "Reviews", "Settings"]);
    assert.equal(await a.locator('[data-testid="setup-checklist"]').count(), 0);
    assert.equal(await a.getByRole("link", { name: "Add period" }).count(), 0);
    await ready(a, "/sentinel/projects/" + IDS.alpha, "h1");
    const own = await a.getByRole("navigation", { name: /Alpha Tyres pages/ }).getByRole("link").allInnerTexts();
    assert.deepEqual(own, ["Overview", "Statements", "Add period", "Import files", "Edit periods", "KPIs", "Peers and trends", "Investigations", "Reviews", "Settings"]);
  }, a);

  await check("Shell: someone else's project, opened by its address, is 'not found' - and nothing of it is shown", async () => {
    await ready(a, "/sentinel/projects/" + IDS.bravo, "h1");
    await a.waitForSelector("text=Project not found");
    assert.ok(!(await a.content()).includes("Bravo"));
  }, a);

  await check("Settings: a reference company's settings are read-only, and the unit API refuses it and refuses B", async () => {
    await ready(a, "/sentinel/projects/" + IDS.ref1 + "/settings", "h1");
    await a.waitForSelector("text=its settings are read-only");
    assert.equal(await a.getByRole("button", { name: "Save changes" }).count(), 0);
    assert.equal(await a.getByRole("button", { name: /Delete project/ }).count(), 0);
    const post = async (token, workspace_id) =>
      (await fetch(BASE + "/api/sentinel/workspace/unit", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ workspace_id, unit: "INR_LAKH", mode: "convert" }) })).status;
    assert.equal(await post("tok-a", IDS.ref1), 403);
    assert.equal(await post("tok-b", IDS.alpha), 404);
    assert.equal((await db("sentinel_workspaces", "&id=eq." + IDS.ref1))[0].currency_unit, "INR_CRORE");
  }, a);

  await check("Switcher: choosing another project on a project page keeps you on the same sub-page", async () => {
    await ready(a, "/sentinel/projects/" + IDS.alpha + "/settings", "h1");
    await a.getByRole("button", { name: /^Project: Alpha Tyres/ }).click();
    await a.getByRole("dialog", { name: "Switch project" }).getByText("Lakh Industries").click();
    await a.waitForURL(new RegExp("/sentinel/projects/" + IDS.lakh + "/settings$"));
    await a.waitForSelector("text=Lakh Industries");
  }, a);

  await check("Palette: Ctrl+K finds a project and moves every page's picker with it", async () => {
    await ready(a, "/sentinel/kpi?workspace=" + IDS.alpha, 'select[aria-label="Company"]');
    await a.keyboard.press("Control+K");
    await a.getByRole("dialog", { name: "Command palette" }).waitFor();
    await a.getByRole("combobox", { name: /Type a command/ }).fill("Lakh Ind");
    await a.getByRole("option", { name: /Switch to Lakh Industries/ }).waitFor();
    await a.keyboard.press("Enter");
    await a.waitForFunction((id) => document.querySelector('select[aria-label="Company"]').value === id, IDS.lakh);
    await a.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  }, a);

  await check("Display unit: the palette switches everything to lakh (Alpha's 1,300 crore is 1,30,000 lakh), and it is remembered", async () => {
    await ready(a, "/sentinel/kpi?workspace=" + IDS.alpha, 'select[aria-label="Company"]');
    await a.waitForSelector("text=Key figures");
    await a.keyboard.press("Control+K");
    await a.getByRole("combobox", { name: /Type a command/ }).fill("lakh");
    await a.getByRole("option", { name: /Show figures in lakh/i }).waitFor();
    await a.keyboard.press("Enter");
    await a.getByRole("radio", { name: "Lakh" }).and(a.locator('[aria-checked="true"]')).waitFor();
    const tile = await a.locator("p", { hasText: /^Revenue \(latest FY, .*Lakh\)$/ }).first().locator("xpath=following-sibling::p[1]").textContent();
    assert.equal(tile.trim(), "1,30,000");
    await a.reload({ waitUntil: "domcontentloaded" });
    await a.getByRole("radio", { name: "Lakh" }).and(a.locator('[aria-checked="true"]')).waitFor();
  }, a);

  await check("Display unit: statements follow the switch, and 'As reported' puts them back", async () => {
    await ready(a, "/sentinel/statements?workspace=" + IDS.alpha, 'select[aria-label="Company"]');
    await a.waitForSelector("text=YoY % (FY26 vs FY25)");
    const row = a.locator("tr", { hasText: "Revenue from Operations" }).first();
    assert.match(await row.textContent(), /1,30,000\.0/);
    assert.match(await a.locator("body").innerText(), /Lakh, converted for display/i);
    await a.getByRole("radio", { name: "As reported" }).click();
    await a.waitForFunction(() => /1,300\.0/.test(document.querySelector("tbody tr")?.textContent ?? ""));
    assert.match(await a.locator("body").innerText(), /all figures as reported/i); // the heading is set in capitals
  }, a);

  await check("Display unit: the Excel export names its unit and carries converted figures", async () => {
    await ready(a, "/sentinel/statements?workspace=" + IDS.alpha, 'select[aria-label="Company"]');
    await a.getByRole("radio", { name: "Lakh" }).click();
    const [download] = await Promise.all([a.waitForEvent("download", { timeout: 60000 }), a.getByRole("button", { name: "Export Excel" }).click()]);
    const ExcelJS = require(path.join(root, "node_modules/exceljs"));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(await download.path());
    const sheet = wb.getWorksheet("Income Statement");
    assert.equal(sheet.getRow(1).getCell(1).value, "Line Item (₹ Lakh)");
    assert.equal(sheet.getRow(2).getCell(3).value, 130000);
    await a.getByRole("radio", { name: "As reported" }).click();
  }, a);

  await check("Add period: the nav link opens on the project you are in, and links to the whole-file Import", async () => {
    await ready(a, "/sentinel/projects/" + IDS.alpha, "h1");
    await a.getByRole("navigation", { name: /Alpha Tyres pages/ }).getByRole("link", { name: "Add period" }).click();
    await a.waitForSelector("#de-existing");
    await a.waitForFunction((id) => document.querySelector("#de-existing").value === id, IDS.alpha);
    assert.equal(await a.getByRole("link", { name: "Import files" }).first().getAttribute("href"), "/sentinel/projects/" + IDS.alpha + "/import");
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

  // ------------------------------------------------------------------------------- autofill (no model) and import
  const pdfPath = path.join(SHOTS, "annual-report.pdf");
  fs.writeFileSync(pdfPath, await makePdf(ANNUAL_REPORT_PAGES));
  const csvPath = path.join(SHOTS, "fy27-lakh.csv");
  fs.writeFileSync(csvPath, ["Alpha Tyres - Consolidated,,", "(Rs. in Lakhs),,", "Particulars,FY27", 'Revenue from operations,"1,60,000"', 'Profit before tax,"16,000"', 'Profit after tax,"12,000"'].join("\n"));

  await check("Autofill: a CSV in lakh fills a crore project's form, converted, with the row each figure came from", async () => {
    await ready(a, "/sentinel/data-entry?workspace=" + IDS.alpha, "#de-existing");
    await a.setInputFiles("#sentinel-autofill-file", csvPath);
    await a.waitForSelector('[data-testid="autofill-summary"]', { timeout: 60000 });
    assert.equal(await field(a, "Revenue from operations").inputValue(), "1600"); // 1,60,000 lakh = 1,600 crore
    assert.equal(await field(a, "Profit after tax").inputValue(), "120");
    assert.equal(await a.locator("#de-plabel").inputValue(), "FY27");
    assert.equal(await a.locator("#de-pend").inputValue(), "2027-03-31");
    assert.match(await a.locator('[data-source-for="revenue_from_operations"]').innerText(), /row \d+ \| Revenue from operations/);
    assert.match(await a.locator('[data-testid="autofill-summary"]').innerText(), /converted to .*Crore/i);
  }, a);

  await check("Autofill: a real PDF is read by rules; derived and doubtful figures are marked 'verify'", async () => {
    await ready(a, "/sentinel/data-entry?workspace=" + IDS.alpha, "#de-existing");
    await a.setInputFiles("#sentinel-autofill-file", pdfPath);
    await a.waitForSelector('[data-testid="autofill-summary"]', { timeout: 60000 });
    assert.equal(await field(a, "Revenue from operations").inputValue(), "1000");
    assert.equal(await field(a, "Profit after tax").inputValue(), "90");
    assert.equal(await field(a, "Cash from operations").inputValue(), "140");
    assert.equal(await field(a, "Cash from investing").inputValue(), "-210");
    assert.equal(await a.locator("#de-plabel").inputValue(), "FY26");
    assert.equal(await a.locator("#de-pbasis").inputValue(), "consolidated");
    assert.match(await a.locator('[data-source-for="revenue_from_operations"]').innerText(), /p\.\d+ \| Revenue from operations/);
  }, a);

  await check("Autofill: a scanned (text-less) PDF is refused on the page with the reason", async () => {
    const { makeBlankPdf } = require(path.join(root, "node_modules/.cache/sentinel-tests/tests/sentinel/pdf-fixtures.js"));
    const blank = path.join(SHOTS, "scanned.pdf");
    fs.writeFileSync(blank, await makeBlankPdf(3));
    await ready(a, "/sentinel/add-period?workspace=" + IDS.alpha, "#mp-company");
    await a.setInputFiles("#sentinel-autofill-file", blank);
    await a.waitForSelector('[role="alert"]:has-text("scanned or image-based")', { timeout: 60000 });
  }, a);

  let pyxis = "";
  await check("New project: a name is required; one screen then creates an empty project you own and opens its Overview", async () => {
    const before = (await db("sentinel_workspaces")).length;
    await ready(a, "/sentinel/new-project", "#np-name");
    await a.getByRole("button", { name: "Create project" }).click();
    await a.waitForSelector('[role="alert"]:has-text("Give the project a name")');
    assert.equal((await db("sentinel_workspaces")).length, before);
    await a.locator("#np-name").fill("Pyxis Lakh Co");
    await a.locator("#np-sector").selectOption("tyre");
    await a.locator("#np-unit").selectOption("INR_LAKH");
    await a.getByRole("button", { name: "Create project" }).click();
    await a.waitForURL(/\/sentinel\/projects\/[0-9a-f-]{36}$/, { timeout: 30000 });
    await a.waitForSelector('[data-testid="start-here"]');
    const [ws] = await db("sentinel_workspaces", "&company_name=eq.Pyxis%20Lakh%20Co");
    assert.equal(ws.owner_id, IDS.A);
    assert.equal(ws.currency_unit, "INR_LAKH");
    pyxis = ws.id;
    assert.equal((await db("sentinel_statements", "&workspace_id=eq." + ws.id)).length, 0); // an empty project is a normal state
    assert.match(await a.locator('[data-testid="setup-checklist"]').innerText(), /0 of 6 done/);
    // The shell now shows this project in the switcher and the side nav.
    assert.ok((await a.getByRole("navigation", { name: /Pyxis Lakh Co pages/ }).getByRole("link", { name: "Import files" }).count()) === 1);
  }, a);

  await check("Import: a real PDF is previewed period by period and saved in the project's unit (1,000 crore = 1,00,000 lakh)", async () => {
    await a.getByRole("navigation", { name: /Pyxis Lakh Co pages/ }).getByRole("link", { name: "Import files" }).click();
    await a.waitForSelector("#sentinel-import-files");
    await a.setInputFiles("#sentinel-import-files", pdfPath);
    await a.waitForSelector('[data-testid="import-summary"]', { timeout: 60000 });
    const summary = await a.locator('[data-testid="import-summary"]').innerText();
    assert.match(summary, /^2 new/);
    assert.match(await a.locator('[aria-label="Periods found"]').innerText(), /FY26[\s\S]*FY25/);
    assert.ok(await a.getByRole("checkbox", { name: /^Import FY26 consolidated from annual-report\.pdf$/ }).isChecked());
    await a.getByRole("button", { name: /^Import 2 periods$/ }).click();
    await a.waitForSelector("text=2 saved", { timeout: 60000 });
    const rows = await db("sentinel_statements", "&workspace_id=eq." + pyxis);
    const fy26 = rows.find((r) => r.period_label === "FY26");
    assert.equal(fy26.revenue_from_operations, 100000);
    assert.equal(fy26.cash_from_operations, 14000);
    assert.equal(fy26.basis, "consolidated");
    assert.equal(fy26.source_file, "annual-report.pdf");
    assert.equal(rows.find((r) => r.period_label === "FY25").revenue_from_operations, 90000);
  }, a);

  await check("Import: importing the same file again offers 'replace', unticked, and changes nothing until ticked", async () => {
    await ready(a, "/sentinel/projects/" + pyxis + "/import", "#sentinel-import-files");
    await a.setInputFiles("#sentinel-import-files", pdfPath);
    await a.waitForSelector('[data-testid="import-summary"]', { timeout: 60000 });
    assert.equal(await a.getByRole("checkbox", { name: /^Import FY26 consolidated/ }).isChecked(), false);
    assert.match(await a.locator('[aria-label="Periods found"]').innerText(), /Replaces/);
    assert.match(await a.locator('[data-testid="import-summary"]').innerText(), /^0 new/);
    assert.equal(await a.getByRole("button", { name: /^Import 0 periods$/ }).isDisabled(), true);
    assert.equal((await db("sentinel_statements", "&workspace_id=eq." + pyxis)).length, 2);
  }, a);

  await check("Overview: after the import the checklist moves on, and the peer table lines a lakh company up with crore ones", async () => {
    await ready(a, "/sentinel/projects/" + pyxis, '[data-testid="setup-checklist"]');
    assert.match(await a.locator('[data-testid="setup-checklist"]').innerText(), /4 of 6 done/); // year, balance sheet, cash flow, prior year
    await ready(a, "/sentinel/kpi?workspace=" + pyxis, 'select[aria-label="Company"]');
    await a.waitForSelector("text=Key figures");
    const tile = await a.locator("p", { hasText: /^Revenue \(latest FY, .* crore\)$/ }).first().locator("xpath=following-sibling::p[1]").textContent();
    assert.equal(tile.trim(), "1,000"); // 1,00,000 lakh shown as 1,000 crore
  }, a);

  await check("Settings: converting lakh to crore rewrites the figures (1,00,000 -> 1,000) after showing the before and after", async () => {
    await ready(a, "/sentinel/projects/" + pyxis + "/settings", "#ps-unit");
    await a.locator("#ps-unit").selectOption("INR_CRORE");
    await a.getByLabel(/Convert them/).check();
    assert.match(await a.locator('[data-testid="unit-preview"]').innerText(), /FY26 revenue: ₹1,00,000\.0 lakh becomes ₹1,000\.0 cr/);
    assert.match(await a.locator('[data-testid="unit-preview"]').innerText(), /2 periods will be rewritten/);
    await a.getByRole("button", { name: "Convert to this unit" }).click();
    await a.waitForSelector("text=2 periods converted");
    const rows = await db("sentinel_statements", "&workspace_id=eq." + pyxis);
    assert.equal(rows.find((r) => r.period_label === "FY26").revenue_from_operations, 1000);
    assert.equal(rows.find((r) => r.period_label === "FY25").revenue_from_operations, 900);
    assert.equal((await db("sentinel_workspaces", "&id=eq." + pyxis))[0].currency_unit, "INR_CRORE");
  }, a);

  await check("Settings: 'only fix the label' changes the unit and leaves every stored figure alone", async () => {
    await a.locator("#ps-unit").selectOption("INR_LAKH");
    await a.getByLabel(/Only fix the label/).check();
    await a.getByRole("button", { name: "Change the label" }).click();
    await a.waitForSelector("text=The stored figures were not changed");
    const rows = await db("sentinel_statements", "&workspace_id=eq." + pyxis);
    assert.equal(rows.find((r) => r.period_label === "FY26").revenue_from_operations, 1000);
    assert.equal((await db("sentinel_workspaces", "&id=eq." + pyxis))[0].currency_unit, "INR_LAKH");
  }, a);

  await check("Settings: general details save, and deleting needs the exact name and removes the project and its periods", async () => {
    await a.locator("#ps-name").fill("Pyxis Renamed Co");
    await a.getByRole("button", { name: "Save changes" }).click();
    await a.waitForSelector("text=Saved.");
    assert.equal((await db("sentinel_workspaces", "&id=eq." + pyxis))[0].company_name, "Pyxis Renamed Co");
    await a.getByRole("button", { name: "Delete project..." }).click();
    await a.locator("#ps-delete").fill("wrong name");
    await a.getByRole("button", { name: "Permanently delete" }).click();
    await a.waitForSelector('[role="alert"]:has-text("Type the project name exactly")');
    assert.equal((await db("sentinel_workspaces", "&id=eq." + pyxis)).length, 1);
    await a.locator("#ps-delete").fill("Pyxis Renamed Co");
    await a.getByRole("button", { name: "Permanently delete" }).click();
    await a.waitForURL(/\/sentinel\/projects$/, { timeout: 30000 });
    assert.equal((await db("sentinel_workspaces", "&id=eq." + pyxis)).length, 0);
    assert.equal((await db("sentinel_statements", "&workspace_id=eq." + pyxis)).length, 0);
  }, a);

  // ------------------------------------------------------------------------------- data entry (server-validated path)
  await check("Data Entry: picks from your own companies and saves through the server", async () => {
    await ready(a, "/sentinel/data-entry", "#de-existing");
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
