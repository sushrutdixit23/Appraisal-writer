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
  const tile = page.locator(`[data-stat="${label}"] [data-stat-value]`);
  if (await tile.count()) return (await tile.first().textContent()).trim();
  const lab = page.locator("p", { hasText: new RegExp("^" + esc(label) + "$") }).first();
  return (await lab.locator("xpath=following-sibling::p[1]").textContent()).trim();
}
// The value of a key-figure tile whose label starts with `prefix` (the revenue tile's label carries the unit).
async function tileValue(page, prefix) {
  return (await page.locator(`[data-stat^="${prefix}"] [data-stat-value]`).first().textContent()).trim();
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
    await a.waitForSelector("text=FY26 vs FY25");
    const row = a.locator("tr", { hasText: "Revenue from Operations" }).first();
    assert.match(await row.textContent(), /\+30\.0%/);
  }, a);

  await check("Executive: reviewed / approved / awaiting are counted from the findings", async () => {
    await ready(a, "/sentinel/executive", "text=Approved findings only");
    assert.equal(await stat(a, "Reviewed"), "2"); // approved + rejected
    assert.equal(await stat(a, "Approved"), "1");
    assert.equal(await stat(a, "Awaiting review"), "1"); // the pending draft
  }, a);

  await check("OCR: a scanned PDF (pictures only) is read through the Import page's OCR card, every figure marked for review", async () => {
    const { makeScannedPdf } = require(path.join(root, "node_modules/.cache/sentinel-tests/tests/sentinel/scan-fixtures.js"));
    const scan = path.join(SHOTS, "scanned-statements.pdf");
    fs.writeFileSync(scan, await makeScannedPdf());
    await ready(a, `/sentinel/projects/${IDS.alpha}/import`, '[data-testid="ocr-card"]');
    await a.getByLabel("Pages to read by OCR").fill("1-2");
    await a.getByLabel("Scanned PDF file").setInputFiles(scan);
    await a.waitForSelector('[data-testid="import-summary"]', { timeout: 120000 });
    const body = await a.locator("body").textContent();
    assert.match(body, /scanned-statements\.pdf/);
    assert.match(body, /OCR/);
    assert.match(body, /FY26/);
  }, a);

  await check("Data request: a CA's trial balance, sent through the public link with no login, arrives as a draft and imports after review", async () => {
    await ready(a, `/sentinel/projects/${IDS.alpha}/import`, '[data-testid="data-requests"]');
    await a.getByLabel("Period ends").fill("2026-08-31");
    await a.getByRole("button", { name: "Create upload link" }).click();
    await a.waitForSelector('[data-testid="request-link"]');
    const link = await a.locator('[data-testid="request-link"] code').textContent();
    const token = link.split("/submit/")[1];
    assert.match(token, /^[A-Za-z0-9_-]{32}$/);
    // The CA side: no session, just the link's token.
    const tb = ["Trial Balance", "Particulars,Debit,Credit", "Sales,,50000000", "Salaries,20000000,", "Sundry Debtors,15000000,", "Share Capital,,5000000", "HDFC Bank,32000000,", "Sundry Creditors,,12000000"].join("\n");
    const form = new FormData();
    form.append("file", new Blob([tb], { type: "text/csv" }), "acme-tb-jun.csv");
    const sent = await fetch(`${BASE}/api/sentinel/submit/${token}`, { method: "POST", body: form });
    assert.equal(sent.status, 200, await sent.clone().text());
    const summary = await sent.json();
    assert.equal(summary.ok, true);
    assert.ok(!JSON.stringify(summary).includes("50000000"), "figures echoed to an unauthenticated caller");
    // The analyst's side: the draft is listed, and adding it puts it in the preview - nothing is saved yet.
    await ready(a, `/sentinel/projects/${IDS.alpha}/import`, '[data-testid="drafts"]');
    await a.getByRole("button", { name: "Add to this import" }).click();
    await a.waitForSelector('[data-testid="import-summary"]');
    // 20M salaries + 15M debtors + 32M bank = 67M of debits = 50M sales + 5M capital + 12M creditors, so it balances and imports.
    assert.match(await a.locator('[data-testid="import-summary"]').textContent(), /1 new/);
    const drafts = await db("sentinel_ingest_drafts");
    assert.equal(drafts.length, 1);
    const stmts = await db("sentinel_statements", `&workspace_id=eq.${IDS.alpha}&period_end_date=eq.2026-08-31`);
    assert.equal(stmts.length, 0, "a draft must not become a statement until it is imported");
    // The link stops working once closed.
    await a.getByRole("button", { name: "Close link" }).click();
    for (let i = 0; i < 40 && (await db("sentinel_data_requests")).every((r) => r.status !== "closed"); i++) await a.waitForTimeout(500);
    const again = await fetch(`${BASE}/api/sentinel/submit/${token}`, { method: "POST", body: form });
    assert.equal(again.status, 404);
  }, a);

  await check("XBRL: an exchange-style results file read in the Import page gives its quarters, each with its figures, before anything is saved", async () => {
    const ctx = (id, a, z) => `<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="x">1</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>${a}</xbrli:startDate><xbrli:endDate>${z}</xbrli:endDate></xbrli:period></xbrli:context>`;
    const f = (n, c, v) => `<in-bse-fin:${n} contextRef="${c}" unitRef="INR">${v}</in-bse-fin:${n}>`;
    const xml = `<?xml version="1.0"?><xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:in-bse-fin="http://www.bseindia.com/xbrl/fin">` +
      ctx("OneD", "2027-01-01", "2027-03-31") + ctx("ThreeD", "2026-01-01", "2026-03-31") +
      `<in-bse-fin:LevelOfRoundingUsedInFinancialStatements contextRef="OneD">Crores</in-bse-fin:LevelOfRoundingUsedInFinancialStatements>` +
      f("RevenueFromOperations", "OneD", 450) + f("ProfitBeforeTax", "OneD", 70) + f("ProfitLossForPeriod", "OneD", 52) +
      f("RevenueFromOperations", "ThreeD", 400) + f("ProfitBeforeTax", "ThreeD", 60) + f("ProfitLossForPeriod", "ThreeD", 44) + `</xbrli:xbrl>`;
    await ready(a, `/sentinel/projects/${IDS.alpha}/import`, "input[type=file]");
    await a.locator("input[type=file]").first().setInputFiles({ name: "results.xml", mimeType: "text/xml", buffer: Buffer.from(xml) });
    await a.waitForSelector('[data-testid="import-summary"]', { timeout: 60000 });
    const body = await a.locator("body").textContent();
    assert.match(body, /results\.xml/);
    assert.match(body, /XBRL, 2 periods/);
    assert.match(body, /Q4 FY27/);
    assert.match(body, /Q4 FY26/);
  }, a);

  await check("Digest: lists the draft waiting for a decision and the flagged company, only for the signed-in owner", async () => {
    await ready(a, "/sentinel/digest", 'h1:has-text("Coverage digest")');
    await a.waitForSelector('[data-testid="digest-summary"]');
    assert.match(await a.locator('[data-testid="digest-summary"]').textContent(), /need attention|Nothing needs/);
    // Alpha has a pending draft (seeded); Bravo belongs to someone else and must never appear.
    const decide = await a.locator('[data-testid="digest-decide"]').textContent();
    assert.match(decide, /Alpha Tyres/);
    assert.ok(!/Bravo/.test(await a.locator("main, body").first().textContent()), "another person's company leaked into the digest");
    // The sidebar links to it, and it links back to where the work is done.
    assert.ok(await a.getByRole("link", { name: "Coverage digest" }).count() > 0);
  }, a);

  await check("Discussion: the analyst shares an investigation, a reviewer with no login reads it and comments, and the analyst sees the comment unread", async () => {
    await ready(a, "/sentinel", "text=Investigation Queue");
    await a.getByTestId("discussion-toggle").first().click();
    await a.getByLabel("Add a comment").fill("Reviewer, please look at the receivable days.");
    await a.getByTestId("post-comment").click();
    await a.waitForSelector('[data-testid="comment"]');
    await a.getByLabel("Reviewer name (optional)").fill("CA Rao");
    await a.getByTestId("share-review").click();
    await a.waitForSelector('[data-testid="review-link"]');
    const link = (await a.locator('[data-testid="review-link"] strong').textContent()).trim();
    assert.match(link, /\/sentinel-review\/[A-Za-z0-9_-]{32}$/);
    // The reviewer: a fresh browser context with no session at all.
    const guest = await browser.newContext();
    const g = await guest.newPage();
    await g.goto(link, { waitUntil: "domcontentloaded" });
    await g.waitForSelector('[aria-label="Discussion"]', { timeout: 60000 });
    const seen = await g.locator("body").textContent();
    assert.match(seen, /Alpha Tyres - FY2[456]/);
    assert.match(seen, /Reviewer, please look at the receivable days\./, "the analyst's comment is visible to the reviewer");
    assert.ok(!/Hypothesis|Bravo/.test(seen), "private working or another company leaked into the review page");
    assert.equal(await g.getByLabel("Your name").inputValue(), "CA Rao");
    await g.getByLabel("Your comment").fill("Is the unbilled revenue in these receivables?");
    await g.getByRole("button", { name: "Send comment" }).click();
    await g.waitForSelector("text=Comment sent.");
    await guest.close();
    // Back with the analyst: one unread, and it clears once the thread is opened.
    await ready(a, "/sentinel", "text=Investigation Queue");
    assert.match(await a.getByTestId("discussion-toggle").first().textContent(), /unread/);
    await a.getByTestId("discussion-toggle").first().click();
    await a.waitForFunction(() => !/unread/.test(document.querySelector('[data-testid="discussion-toggle"]').textContent));
    assert.match(await a.locator('[data-testid="discussion"]').first().textContent(), /Is the unbilled revenue in these receivables\?/);
    // The link can be closed.
    await a.getByRole("button", { name: "Close link" }).first().click();
    const token = link.split("/sentinel-review/")[1];
    for (let i = 0; i < 40; i++) { const r = await fetch(`${BASE}/api/sentinel/review/${token}`); if (r.status === 404) return; await a.waitForTimeout(500); }
    assert.fail("the closed review link still opens");
  }, a);

  await check("Digest: a new filing for the signed-in owner's company is listed with its BSE link, and another person's is not", async () => {
    await ready(a, "/sentinel/digest", '[data-testid="digest-filings"]');
    await a.waitForFunction(() => /Lakh Industries - results filed 2026-10-09/.test(document.body.textContent), null, { timeout: 30000 });
    const text = await a.locator('[data-testid="digest-filings"]').textContent();
    assert.match(text, /Financial Results for the quarter ended September 30, 2026/);
    assert.match(text, /https:\/\/www\.bseindia\.com\/x/);
    assert.ok(!/Bravo/.test(await a.locator("body").textContent()), "another person's filing leaked");
    assert.match(await a.locator('[data-testid="digest-discussion"]').textContent(), /Reviewer comments/);
  }, a);

  await check("Results calendar: lists your listed companies with a statutory deadline, and names the ones with no symbol; never another person's company", async () => {
    await ready(a, "/sentinel/calendar", '[data-testid="calendar-table"]');
    const table = await a.locator('[data-testid="calendar-table"]').textContent();
    assert.match(table, /Lakh Industries/);
    assert.match(table, /Q[1-4] FY\d{2}/);
    assert.match(table, /\b20\d{2}-\d{2}-\d{2}\b/);
    const status = await a.locator('[data-testid="calendar-table"] tbody tr').first().getAttribute("data-status");
    assert.ok(["filed", "open", "due_soon", "overdue"].includes(status), status);
    const body = await a.locator("body").textContent();
    assert.match(body, /Not on the calendar \(no NSE symbol or BSE code\): .*Alpha Tyres/);
    assert.ok(!/Bravo/.test(body), "another person's company leaked into the calendar");
    assert.ok(await a.getByRole("link", { name: "Results calendar" }).count() > 0);
  }, a);

  await check("Results brief: a quarter against the previous quarter, last year, the trailing twelve months and the peers that reported", async () => {
    await ready(a, "/sentinel/results?workspace=" + IDS.alpha, '[data-testid="results-table"]');
    const table = await a.locator('[data-testid="results-table"]').textContent();
    assert.match(table, /Alpha Tyres - Q2 FY27/);
    assert.match(table, /Q1 FY27/);
    assert.match(table, /Q2 FY26/);
    // Revenue 400 against 380 (+5.3%) and 350 (+14.3%); EBITDA margin 20.0% against 19.5% (+53 bps) and 18.9% (+114 bps).
    assert.match(table, /\+5\.3%/);
    assert.match(table, /\+14\.3%/);
    assert.match(table, /\+53 bps/);
    assert.match(table, /\+114 bps/);
    // Four quarters are not on file (no Q4 FY26 / Q3 FY26): the page says which are missing rather than guessing.
    assert.match(await a.locator('[data-testid="results-ttm"]').textContent(), /Not available: add Q4 FY26 and Q3 FY26/);
    const peers = await a.locator('[data-testid="results-peers"]').textContent();
    assert.match(peers, /Apex Reference Tyres/);
    assert.match(peers, /Meridian Reference Tyres/);
    assert.match(peers, /Zenith Reference Tyres/); // reported nothing for the quarter: named as not yet reported
    assert.match(peers, /Not yet reported.*Zenith Reference Tyres/);
    assert.ok(!/Bravo/.test(await a.locator("body").textContent()), "another person's company leaked into the brief");
    await a.getByLabel("Quarter", { exact: true }).selectOption({ label: "Q1 FY27" });
    await a.waitForSelector('[data-testid="results-table"]:has-text("Alpha Tyres - Q1 FY27")');
  }, a);

  await check("Estimates: typed in and uploaded as a CSV, they give beat / in line / miss by line on the quarter, and wait for a quarter not yet reported", async () => {
    await ready(a, "/sentinel/results?workspace=" + IDS.alpha, '[data-testid="estimates-panel"]');
    assert.match(await a.locator('[data-testid="results-variance"]').textContent(), /No estimates are stored for the quarter ended 2026-09-30/);
    await a.locator("#est-period").fill("2026-09-30");
    await a.locator("#est-revenue").fill("390");      // actual 400: +2.6%, a beat
    await a.locator("#est-ebitda").fill("80.5");      // actual 80: -0.6%, in line
    await a.locator("#est-pat").fill("48");           // actual 45: -6.3%, a miss
    await a.locator("#est-label").fill("Street");
    await a.getByTestId("save-estimates").click();
    await a.waitForSelector('[data-testid="results-variance"]:has-text("Street")');
    const v = await a.locator('[data-testid="results-variance"]').textContent();
    assert.match(v, /Revenue from operations/);
    assert.match(v, /\+2\.6%\s*Beat/);
    assert.match(v, /-0\.6%\s*In line/);
    assert.match(v, /-6\.3%\s*Miss/);
    // A CSV for the next quarter: stored, and said to be waiting for results.
    const csv = "period,revenue,PAT,source,source label\nQ3 FY27,410,47,own,My model\n";
    await a.getByLabel("Estimates CSV").setInputFiles({ name: "est.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await a.waitForSelector('[data-testid="estimates-waiting"]:has-text("2026-12-31")');
    const rows = await db("sentinel_estimates", `&workspace_id=eq.${IDS.alpha}`);
    assert.equal(rows.length, 5);
    assert.ok(rows.every((r) => r.owner_id === IDS.A));
    // Another person has none of them.
    await ready(b, "/sentinel/results?workspace=" + IDS.ref1, '[data-testid="estimates-panel"]');
    assert.ok(!/Street/.test(await b.locator("body").textContent()));
  }, a);

  await check("Commentary: a call transcript gives statements with their exact words, drops what cannot be traced, and compares with the previous call", async () => {
    const pad = (lines) => lines.flatMap((s) => Array.from({ length: 8 }, (_, i) => `${s} (remark ${i + 1})`)).join("\n");
    const q2 = pad(["We expect revenue growth of 4 to 6 percent in the second half, and we remain confident in our deal pipeline.", "Attrition has come down to 12.5% and we expect it to stay below 13% through the year.", "Client budgets in the banking vertical remain cautious and decisions are taking longer than before."]);
    const q1 = pad(["We are cautious about the second half given the weak demand in several verticals.", "Attrition remained elevated at 14.8% during the quarter.", "The deal pipeline is steady and conversations with clients continue as planned for the year."]);
    await ready(a, "/sentinel/results?workspace=" + IDS.alpha, '[data-testid="commentary-panel"]');
    await a.locator("#tr-text").fill(q2);
    await a.getByTestId("read-transcript").click();
    await a.waitForSelector('[data-testid="results-commentary"]:has-text("Management expects 4-6% revenue growth")', { timeout: 60000 });
    let panel = await a.locator('[data-testid="results-commentary"]').textContent();
    assert.match(panel, /3 statements/);
    assert.match(panel, /We expect revenue growth of 4 to 6 percent in the second half/);
    assert.match(await a.getByTestId("commentary-dropped").textContent(), /1 more was dropped because they could not be traced to the transcript \(the quote does not appear in the transcript\)/);
    assert.ok(!/record quarter/.test(panel), "a statement with an invented quote was shown");
    assert.match(panel, /Read Q1 FY27.s call as well/);
    // The previous quarter's call.
    await a.getByLabel("Quarter", { exact: true }).selectOption({ label: "Q1 FY27" });
    await a.waitForSelector('[data-testid="commentary-form"]');
    await a.locator("#tr-text").fill(q1);
    await a.getByTestId("read-transcript").click();
    await a.waitForSelector('[data-testid="results-commentary"]:has-text("Management is cautious about the second half")', { timeout: 60000 });
    await a.getByLabel("Quarter", { exact: true }).selectOption({ label: "Q2 FY27" });
    await a.waitForSelector('[data-testid="commentary-changes"]');
    const changes = await a.getByTestId("commentary-changes").textContent();
    assert.match(changes, /Since Q1 FY27/);
    assert.match(changes, /Outlook and guidance: the tone moved from negative to positive/);
    assert.match(changes, /Hiring, attrition and wages: the tone moved from negative to positive/);
    assert.match(changes, /Demand and volumes: new this call/);
    // Only statements are stored, never the transcript.
    const rows = await db("sentinel_transcripts", `&workspace_id=eq.${IDS.alpha}`);
    assert.equal(rows.length, 2);
    assert.ok(!JSON.stringify(rows).includes("(remark 7)"), "the transcript text was stored");
  }, a);

  await check("Earnings note: the draft downloads as a real Word file holding the quarter, the estimates and the verified commentary, with no rating", async () => {
    await ready(a, "/sentinel/results?workspace=" + IDS.alpha, '[data-testid="download-note"]');
    const [download] = await Promise.all([a.waitForEvent("download", { timeout: 120000 }), a.getByTestId("download-note").click()]);
    assert.equal(download.suggestedFilename(), "Alpha_Tyres_Q2_FY27_earnings_note.docx");
    const bytes = fs.readFileSync(await download.path());
    assert.equal(bytes.subarray(0, 2).toString(), "PK");
    const zip = await require("jszip").loadAsync(bytes);
    const xml = await zip.file("word/document.xml").async("string");
    for (const needle of ["Alpha Tyres: Q2 FY27 results", "DRAFT for analyst review", "₹400 cr", "+14.3%", "Against estimates", "What management said", "gives no rating, target price or recommendation"]) {
      assert.ok(xml.includes(needle), `missing in the note: ${needle}`);
    }
    assert.ok(!/Bravo/.test(xml), "another person's company leaked into the note");
  }, a);

  await check("Results brief: a company with no quarterly results says how to add them", async () => {
    await ready(a, "/sentinel/results?workspace=" + IDS.lakh, '[data-testid="results-empty"]');
    assert.match(await a.locator('[data-testid="results-empty"]').textContent(), /no quarterly results on file/);
  }, a);

  await check("Auditor's report: a qualified opinion saved with the year shows on the project Overview and on the digest, and survives a hand edit of a figure", async () => {
    await ready(a, `/sentinel/projects/${IDS.alpha}`, '[data-testid="auditor-report"]');
    const card = await a.locator('[data-testid="auditor-report"]').textContent();
    assert.match(card, /Auditor.s report, FY26/);
    assert.match(card, /Opinion: qualified/);
    assert.match(card, /The auditor has qualified the opinion \(p\.9\)/);
    assert.match(card, /not provided for doubtful advances of Rs 120 crore/);
    assert.match(card, /Contingent liabilities stated with an amount/);
    assert.match(card, /Rs 506 crore/);
    await ready(a, "/sentinel/digest", '[data-testid="digest-audit"]');
    assert.match(await a.locator('[data-testid="digest-audit"]').textContent(), /Alpha Tyres - FY26: the auditor has qualified the opinion/);
    // Editing a figure by hand must not wipe the checks.
    await ready(a, "/sentinel/add-period?workspace=" + IDS.alpha, "#mp-company");
    await a.locator("#mp-period").selectOption({ label: "FY26 (FY, consolidated)" });
    const original = await field(a, "Other income").inputValue();
    await fill(a, "Other income", String(Number(original || 0) + 1));
    await a.getByRole("button", { name: "Update period" }).click();
    await a.waitForSelector("text=Period updated.");
    const [row] = await db("sentinel_statements", `&workspace_id=eq.${IDS.alpha}&period_label=eq.FY26`);
    assert.match(row.annual_report_checks ?? "", /"o":"qualified"/);
    // Put the figure back: later checks (the revenue-to-profit bridge) read Alpha FY26 as seeded.
    await ready(a, "/sentinel/add-period?workspace=" + IDS.alpha, "#mp-company");
    await a.locator("#mp-period").selectOption({ label: "FY26 (FY, consolidated)" });
    await fill(a, "Other income", original);
    await a.getByRole("button", { name: "Update period" }).click();
    await a.waitForSelector("text=Period updated.");
  }, a);

  await check("Covenants: limits are tested on the latest annual statement - one tight, one breached - listed in the digest, and a new one can be added and removed", async () => {
    await ready(a, "/sentinel/covenants?workspace=" + IDS.alpha, '[data-testid="covenants-table"]');
    const rows = await a.locator('[data-testid="covenant-row"]').allTextContents();
    assert.equal(rows.length, 2);
    assert.match(rows[0], /Working capital line/); // breached ranks first
    assert.match(rows[0], /Breached/);
    assert.match(rows[0], /1\.25x/);
    assert.match(rows[0], /Current ratio 1\.25x against at least 1\.50x - 20% past the limit/);
    assert.match(rows[1], /Term loan A/);
    assert.match(rows[1], /Tight/);
    assert.match(rows[1], /Debt \/ equity 0\.50x against at most 0\.55x - 9% of room/);
    await ready(a, "/sentinel/digest", '[data-testid="digest-covenants"]');
    const digest = await a.locator('[data-testid="digest-covenants"]').textContent();
    assert.match(digest, /Alpha Tyres - Working capital line: covenant breached/);
    assert.match(digest, /Alpha Tyres - Term loan A: covenant tight/);
    await ready(a, "/sentinel/covenants?workspace=" + IDS.alpha, '[data-testid="covenants-table"]');
    await a.getByLabel("Lender or facility").fill("Bond covenant");
    await a.getByLabel("Ratio").selectOption("interest_cover");
    await a.getByLabel("Limit (x)").fill("2.5");
    await a.getByRole("button", { name: "Add covenant" }).click();
    await a.waitForSelector("text=Covenant saved.");
    await a.waitForFunction(() => document.querySelectorAll('[data-testid="covenant-row"]').length === 3);
    const added = (await a.locator('[data-testid="covenant-row"]').allTextContents()).find((t) => /Bond covenant/.test(t));
    assert.match(added, /Cannot test/); // no finance costs on file: no ratio, and it says so
    await a.getByRole("button", { name: "Remove Bond covenant" }).click();
    await a.waitForFunction(() => document.querySelectorAll('[data-testid="covenant-row"]').length === 2);
    assert.equal((await db("sentinel_covenants", `&workspace_id=eq.${IDS.alpha}`)).length, 2);
  }, a);

  await check("Calibration: says how many decisions it has and warns that a small sample is not a verdict", async () => {
    await ready(a, "/sentinel/calibration", '[data-testid="calibration-summary"]');
    assert.match(await a.locator('[data-testid="calibration-summary"]').textContent(), /decided investigations/);
    assert.match(await a.locator('[data-testid="calibration-caveat"]').textContent(), /noise|warming up/);
    assert.equal(await a.locator("tbody tr").count(), 4); // the four confidence buckets
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

  // ------------------------------------------------------------------------------- charts and tables
  await check("Charts: a key figure carries its change on last year, with an arrow, a sign and its meaning in words", async () => {
    await ready(a, "/sentinel/kpi?workspace=" + IDS.alpha, 'select[aria-label="Company"]');
    await a.waitForSelector("text=Key figures");
    const rev = a.locator('[data-stat^="Revenue (latest FY"]');
    assert.match(await rev.innerText(), /\+30\.0%/);
    const chip = rev.locator('[aria-label*="versus FY25"]');
    assert.match(await chip.getAttribute("aria-label"), /^Up 30\.0% versus FY25, favourable$/);
    // PAT margin fell 0.3pp: down, and unfavourable. Days outstanding up would be unfavourable too; costs are never coloured.
    const pat = a.locator('[data-stat="PAT margin"] [aria-label*="versus FY25"]');
    assert.match(await pat.getAttribute("aria-label"), /^Down 0\.3pp versus FY25, unfavourable$/);
    // The formula is one press away, not hover-only.
    await a.getByRole("button", { name: "How is EBITDA margin worked out?" }).click();
    await a.waitForSelector("text=EBITDA / Revenue from Operations");
  }, a);

  await check("Charts: hovering a column shows the figure and its change on the year before; the Table view has the same numbers", async () => {
    const fig = a.locator('figure[aria-label="Revenue by year"]');
    const group = fig.locator('[role="group"]');
    await group.scrollIntoViewIfNeeded();
    const box = await group.boundingBox();
    await a.mouse.move(box.x + box.width * 0.75, box.y + 90);
    const tipEl = a.locator('[data-testid="chart-tooltip"]').last();
    await tipEl.waitFor();
    const tip = await tipEl.innerText();
    assert.match(tip, /FY26/);
    assert.match(tip, /1,300/);
    assert.match(tip, /\+30\.0%/);
    await a.mouse.move(0, 0);
    await fig.getByRole("radio", { name: "Table" }).click();
    const table = await fig.locator("table").innerText();
    assert.match(table, /FY25\s+1,000/);
    assert.match(table, /FY26\s+1,300\s+\+30\.0%/);
  }, a);

  await check("Charts: keyboard - arrow keys step through the periods and each stop is announced", async () => {
    const fig = a.locator('figure[aria-label="Revenue by year"]');
    await fig.getByRole("radio", { name: "Chart" }).click();
    await fig.locator('[role="group"]').focus();
    await a.keyboard.press("End");
    assert.equal((await fig.locator('[role="status"]').textContent()).trim(), "FY26: 1,300");
    await a.keyboard.press("ArrowLeft");
    assert.equal((await fig.locator('[role="status"]').textContent()).trim(), "FY25: 1,000");
    await a.keyboard.press("Escape");
    assert.equal((await fig.locator('[role="status"]').textContent()).trim(), "");
  }, a);

  await check("Charts: peer standing ranks best first, the company is bronze, and lower-is-better flips the order", async () => {
    const sec = a.locator("section", { hasText: "Peer standing" });
    const names = async () => (await sec.getByRole("listitem").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label").split(",")[0])));
    assert.deepEqual(await names(), ["Meridian Reference Tyres", "Alpha Tyres", "Apex Reference Tyres", "Zenith Reference Tyres"]);
    assert.match(await sec.getByRole("listitem").nth(1).getAttribute("aria-label"), /rank 2 of 4, 1,300, the company you are viewing/);
    assert.match(await sec.innerText(), /Average 1,338/);
    // Debt-to-equity: only Alpha has balance-sheet data in the seed, so it is the only row; the order rule is unit-tested.
    await sec.locator("select").selectOption({ label: "Current ratio" });
    await a.waitForFunction(() => document.querySelectorAll('[role="listitem"]').length >= 1);
  }, a);

  await check("Charts: the trend comparison draws every peer quietly, names the company, and lists everyone at the hovered period", async () => {
    await ready(a, "/sentinel/analysis?workspace=" + IDS.alpha, "text=Peer benchmark");
    const sec = a.locator("section", { hasText: "Trend comparison" });
    await sec.locator('[role="group"]').first().scrollIntoViewIfNeeded();
    const box = await sec.locator('[role="group"]').first().boundingBox();
    await a.mouse.move(box.x + box.width - 60, box.y + 120);
    const tip = a.locator('[data-testid="chart-tooltip"]').last();
    await tip.waitFor();
    const text = await tip.innerText();
    for (const name of ["Alpha Tyres", "Apex Reference Tyres", "Meridian Reference Tyres", "Zenith Reference Tyres"]) assert.match(text, new RegExp(name));
    assert.match(text, /2,000/);
    assert.match(text, /\+30\.0%/);
  }, a);

  await check("Charts: pressing a peer in the legend compares the company with just that peer; pressing again restores all", async () => {
    const sec = a.locator("section", { hasText: "Trend comparison" });
    await a.mouse.move(0, 0);
    const apex = sec.getByRole("button", { name: "Apex Reference Tyres" });
    await apex.click();
    assert.equal(await apex.getAttribute("aria-pressed"), "true");
    await apex.click();
    assert.equal(await apex.getAttribute("aria-pressed"), "false");
  }, a);

  await check("Charts: 'Peer range' replaces the lines with the peers' median and spread, and says how many peers back it", async () => {
    const sec = a.locator("section", { hasText: "Trend comparison" });
    await sec.getByRole("radio", { name: "Peer range" }).click();
    await a.waitForSelector("text=Peer range (low to high)");
    await sec.locator('[role="group"]').first().scrollIntoViewIfNeeded();
    const box = await sec.locator('[role="group"]').first().boundingBox();
    await a.mouse.move(box.x + 90, box.y + 120);
    const tip = a.locator('[data-testid="chart-tooltip"]').last();
    await tip.waitFor();
    const text = await tip.innerText();
    assert.match(text, /Peer median\s+1,180/); // FY25 peers: 1,180, 1,900, 760
    assert.match(text, /760 to 1,900/);
    assert.match(text, /3 peers with data/);
    await sec.getByRole("radio", { name: "Each peer" }).click();
  }, a);

  await check("Tables: the benchmark table sorts by any column (missing values last), flags the company, and downloads as CSV", async () => {
    const bench = a.locator("section", { hasText: "Peer benchmark" });
    const first = async () => bench.locator("tbody tr td:first-child").allInnerTexts();
    await bench.getByRole("button", { name: /PAT margin/i }).click();
    assert.deepEqual((await first()).map((t) => t.replace(/\s+/g, " ").trim()), ["Alpha Tyres YOU", "Meridian Reference Tyres", "Apex Reference Tyres", "Zenith Reference Tyres", "Peer median"]);
    assert.equal(await bench.locator("th[aria-sort='descending']").count(), 1);
    await bench.getByRole("button", { name: /PAT margin/i }).click();
    assert.equal((await first())[0], "Zenith Reference Tyres");
    // A column with blanks sorts them last in both directions.
    await bench.getByRole("button", { name: /Current ratio/i }).click();
    assert.match((await first())[0], /^Alpha Tyres/);
    await bench.getByRole("button", { name: /Current ratio/i }).click();
    assert.match((await first())[0], /^Alpha Tyres/);
    const [download] = await Promise.all([a.waitForEvent("download"), bench.getByRole("button", { name: "Download" }).click()]);
    const csv = fs.readFileSync(await download.path(), "utf8");
    assert.match(csv.split("\r\n")[0], /^Company,Revenue \(₹ crore\),EBITDA margin,/);
    assert.match(csv, /Alpha Tyres,1300,0\.2,/);
  }, a);

  await check("Tables: the statement shows the change on last year with its meaning, a trend line, and brackets for negatives", async () => {
    await ready(a, "/sentinel/statements?workspace=" + IDS.alpha, "text=From revenue to profit");
    const row = a.locator("tr", { hasText: "Profit After Tax" }).first();
    assert.match(await row.innerText(), /\+25\.0%/);
    assert.match(await row.locator('[aria-label*="Up 25.0%"]').getAttribute("aria-label"), /favourable/);
    // The PAT margin fell, so its chip is down and unfavourable; the cost lines stay neutral.
    const margin = a.locator("tr", { hasText: "PAT Margin" }).first();
    assert.match(await margin.locator('[aria-label*="Down 0.3pp"]').getAttribute("aria-label"), /unfavourable/);
    assert.equal(await a.locator("tr", { hasText: "Total Expenses" }).first().locator('[aria-label*="favourable"]').count(), 0);
  }, a);

  await check("Charts: the revenue-to-profit bridge ends on the reported profit, and shows a gap in the filing as its own step", async () => {
    const wf = a.locator("section", { hasText: "From revenue to profit" });
    await wf.getByRole("radio", { name: "Table" }).click();
    const table = await wf.locator("table").innerText();
    // Alpha's seed: revenue 1,300, costs 1,150, but profit before tax 130 (not 150): the 20 gap is shown, not hidden.
    assert.match(table, /Revenue\s+1,300/);
    assert.match(table, /Costs\s+-1,150/);
    assert.match(table, /Other \/ unreconciled\s+-20/);
    assert.match(table, /Profit before tax\s+130/);
    assert.match(table, /Profit after tax\s+100/);
    await wf.getByRole("radio", { name: "Chart" }).click();
    await wf.locator('[role="group"]').scrollIntoViewIfNeeded();
    const box = await wf.locator('[role="group"]').boundingBox();
    await a.mouse.move(box.x + box.width * 0.3, box.y + 150);
    const tip = a.locator('[data-testid="chart-tooltip"]').last();
    await tip.waitFor();
    assert.match(await tip.innerText(), /costs/i); // the tooltip title is set in capitals
  }, a);

  await check("Motion: with 'reduce motion' on, charts are drawn in their final state straight away", async () => {
    const quiet = await browser.newContext({ viewport: { width: 1280, height: 1000 }, reducedMotion: "reduce" });
    const now = Math.floor(Date.now() / 1000);
    const payload = { access_token: "tok-a", token_type: "bearer", expires_in: 31536000, expires_at: now + 31536000, refresh_token: "r-tok-a", user: { id: IDS.A, aud: "authenticated", role: "authenticated", email: "a@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" } };
    await quiet.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) {} }, ["zyntask-engage-session", JSON.stringify(payload)]);
    const q = await quiet.newPage();
    await q.goto(BASE + "/sentinel/kpi?workspace=" + IDS.alpha, { waitUntil: "domcontentloaded" });
    await q.waitForSelector('figure[aria-label="Revenue by year"] svg path[fill="#B0652B"]', { timeout: 60000 });
    const h = await q.locator('figure[aria-label="Revenue by year"] svg path[fill="#B0652B"]').last().evaluate((el) => el.getBBox().height);
    assert.ok(h > 100, "the column should already be full height, got " + h);
    await quiet.close();
  });

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
    assert.deepEqual(links, ["Overview", "Statements", "KPIs", "Peers and trends", "Results brief", "Investigations", "Reviews", "Settings"]);
    assert.equal(await a.locator('[data-testid="setup-checklist"]').count(), 0);
    assert.equal(await a.getByRole("link", { name: "Add period" }).count(), 0);
    await ready(a, "/sentinel/projects/" + IDS.alpha, "h1");
    const own = await a.getByRole("navigation", { name: /Alpha Tyres pages/ }).getByRole("link").allInnerTexts();
    assert.deepEqual(own, ["Overview", "Statements", "Import files", "Edit periods", "KPIs", "Peers and trends", "Results brief", "Covenants", "Investigations", "Reviews", "Settings"]);
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
    assert.equal(await tileValue(a, "Revenue (latest FY, \u20b9 Lakh"), "1,30,000");
    await a.reload({ waitUntil: "domcontentloaded" });
    await a.getByRole("radio", { name: "Lakh" }).and(a.locator('[aria-checked="true"]')).waitFor();
  }, a);

  await check("Display unit: statements follow the switch, and 'As reported' puts them back", async () => {
    await ready(a, "/sentinel/statements?workspace=" + IDS.alpha, 'select[aria-label="Company"]');
    await a.waitForSelector("text=FY26 vs FY25");
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

  await check("Add period is gone: the Overview leads with 'Import a file', and nothing links to the old page", async () => {
    await ready(a, "/sentinel/projects/" + IDS.alpha, "h1");
    assert.equal(await a.getByRole("link", { name: "Add period" }).count(), 0);
    assert.equal(await a.getByRole("link", { name: "Import a file" }).first().getAttribute("href"), "/sentinel/projects/" + IDS.alpha + "/import");
    await a.keyboard.press("Control+k");
    await a.getByRole("combobox", { name: "Type a command or a project name" }).fill("add period");
    assert.equal(await a.getByRole("option", { name: /^Add period/ }).count(), 0);
    await a.keyboard.press("Escape");
  }, a);

  await check("Sidebar: it stays put while the page scrolls, hides and shows from the top bar or Ctrl+B, and the choice is remembered", async () => {
    try {
      await ready(a, "/sentinel/kpi?workspace=" + IDS.alpha, 'select[aria-label="Company"]');
      await a.waitForSelector("text=Key figures");
      await a.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const top = await a.evaluate(() => document.querySelector("#sentinel-sidebar").getBoundingClientRect().top);
      assert.equal(top, 0, "the sidebar scrolled away with the page");
      assert.ok(await a.getByRole("navigation", { name: /Alpha Tyres pages/ }).isVisible());
      await a.evaluate(() => window.scrollTo(0, 0));

      const widthOf = () => a.evaluate(() => Math.round(document.querySelector("#sentinel-sidebar").getBoundingClientRect().width));
      assert.equal(await widthOf(), 232);
      await a.getByRole("button", { name: "Hide sidebar" }).click();
      await a.waitForFunction(() => document.querySelector("#sentinel-sidebar").getBoundingClientRect().width === 0);
      assert.equal(await a.locator("#sentinel-sidebar").getAttribute("aria-hidden"), "true");
      assert.equal(await a.getByRole("button", { name: "Show sidebar" }).getAttribute("aria-expanded"), "false");

      await a.reload();
      await a.waitForSelector('select[aria-label="Company"]');
      await a.waitForFunction(() => document.querySelector("#sentinel-sidebar").getBoundingClientRect().width === 0);

      await a.keyboard.press("Control+b");
      await a.waitForFunction(() => document.querySelector("#sentinel-sidebar").getBoundingClientRect().width === 232);
      assert.equal(await a.locator("#sentinel-sidebar").getAttribute("aria-hidden"), "false");
      await a.getByRole("button", { name: "Hide sidebar" }).waitFor();
    } finally {
      // Whatever happened above, leave the sidebar open for every check after this one.
      await a.evaluate(() => { try { localStorage.setItem("sentinel-sidebar-collapsed", "0"); } catch (e) {} });
      await a.reload();
      await a.waitForSelector("#sentinel-sidebar");
    }
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
    // The source line is behind an (i) toggle now, not always on screen - see StatementFields.tsx.
    await a.locator('[data-testid="info-toggle-revenue_from_operations"]').click();
    assert.match(await a.locator('[data-source-for="revenue_from_operations"]').innerText(), /row \d+ \| Revenue from operations/);
    assert.match(await a.locator('[data-testid="autofill-summary"]').innerText(), /converted to .*Crore/i);
  }, a);

  const multiPeriodCsvPath = path.join(SHOTS, "fy40-fy41.csv");
  fs.writeFileSync(
    multiPeriodCsvPath,
    ["period,revenue from operations,profit before tax,profit after tax", "FY40,2000,300,220", "FY41,1800,260,190"].join("\n")
  );

  await check("Manage Periods: a file with more than one period offers the rest after you save the first, with no re-upload", async () => {
    await ready(a, "/sentinel/add-period?workspace=" + IDS.alpha, "#mp-company");
    await a.setInputFiles("#sentinel-autofill-file", multiPeriodCsvPath);
    await a.waitForSelector('[data-testid="autofill-summary"]', { timeout: 60000 });
    assert.match(await a.locator('[data-testid="autofill-summary"]').innerText(), /2 periods found/);
    const firstLabel = await a.locator("#mp-plabel").inputValue();
    assert.ok(["FY40", "FY41"].includes(firstLabel), firstLabel);
    const secondLabel = firstLabel === "FY40" ? "FY41" : "FY40";
    await a.getByRole("button", { name: "Save new period" }).click();
    await a.waitForSelector("text=Period added.");
    // The other period from the same file is offered right here - no re-upload, no trip to Import files.
    const offer = a.getByRole("button", { name: new RegExp("Fill the form with " + secondLabel) });
    await offer.waitFor();
    await offer.click();
    await a.waitForSelector("#mp-company"); // back on the editable form
    assert.equal(await a.locator("#mp-plabel").inputValue(), secondLabel);
    await a.getByRole("button", { name: "Save new period" }).click();
    await a.waitForSelector("text=Period added.");
    // Both periods landed, not just the first - the gap this check exists for.
    const fy40 = await db("sentinel_statements", "&period_label=eq.FY40&workspace_id=eq." + IDS.alpha);
    const fy41 = await db("sentinel_statements", "&period_label=eq.FY41&workspace_id=eq." + IDS.alpha);
    assert.equal(fy40.length, 1);
    assert.equal(fy41.length, 1);
    assert.equal(fy40[0].revenue_from_operations, 2000);
    assert.equal(fy41[0].revenue_from_operations, 1800);
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
    await a.locator('[data-testid="info-toggle-revenue_from_operations"]').click();
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

  await check("Statements: a project with no periods says so and offers 'Import a file'", async () => {
    await a.getByRole("navigation", { name: /Pyxis Lakh Co pages/ }).getByRole("link", { name: "Statements" }).click();
    await a.waitForSelector('[data-testid="empty-statements"]');
    const box = a.locator('[data-testid="empty-statements"]');
    assert.match(await box.innerText(), /No financial statements yet/);
    assert.match(await box.getByRole("link", { name: "Import a file" }).getAttribute("href"), /\/sentinel\/projects\/[0-9a-f-]{36}\/import$/);
    await ready(a, "/sentinel/projects/" + pyxis, '[data-testid="setup-checklist"]');
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
    assert.equal(await tileValue(a, "Revenue (latest FY, \u20b9 crore"), "1,000"); // 1,00,000 lakh shown as 1,000 crore
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

  await check("Peer valuation: a share price plus shares outstanding gives a market cap and P/E on the KPI page", async () => {
    // FY41 is Alpha's latest period on file by this point (saved earlier from the two-period CSV: revenue
    // 1,800, PBT 260, PAT 190) - editing FY26 here would miss, since it is no longer the latest statement.
    await ready(a, "/sentinel/add-period?workspace=" + IDS.alpha, "#mp-company");
    await a.locator("#mp-period").selectOption({ label: "FY41 (FY, consolidated)" });
    await fill(a, "Shares outstanding", "10000000"); // 1 crore shares
    await a.getByRole("button", { name: "Update period" }).click();
    await a.waitForSelector("text=Period updated.");

    await ready(a, "/sentinel/projects/" + IDS.alpha + "/settings", "#ps-name");
    await a.locator("#ps-price").fill("abc");
    await a.getByRole("button", { name: "Save price" }).click();
    await a.waitForSelector('[role="alert"]:has-text("That is not a number.")');
    await a.locator("#ps-price").fill("1000");
    await a.getByRole("button", { name: "Save price" }).click();
    await a.waitForSelector('[aria-label="Market data"]:has-text("Saved.")');
    const [row] = await db("sentinel_workspaces", "&id=eq." + IDS.alpha);
    assert.equal(row.market_price, 1000);

    // The exchange symbols save with Save price, so the filing watcher does not depend on the price feed answering.
    assert.equal(await a.getByTestId("check-filings").isDisabled(), true, "no BSE code saved yet");
    await a.locator("#ps-bse").fill("532 540");
    await a.getByRole("button", { name: "Save price" }).click();
    await a.waitForSelector('[role="alert"]:has-text("letters, digits")');
    await a.locator("#ps-bse").fill("532540");
    await a.locator("#ps-ticker").fill("ALPHA");
    await a.getByRole("button", { name: "Save price" }).click();
    for (let i = 0; i < 40 && (await db("sentinel_workspaces", "&id=eq." + IDS.alpha))[0].bse_code !== "532540"; i++) await a.waitForTimeout(250);
    const [saved] = await db("sentinel_workspaces", "&id=eq." + IDS.alpha);
    assert.deepEqual([saved.bse_code, saved.ticker], ["532540", "ALPHA"]);
    await a.waitForFunction(() => !document.querySelector('[data-testid="check-filings"]').disabled);

    // Market cap = price 1,000 x 10,000,000 shares / 1e7 = 1,000 cr. P/E = 1,000 / PAT 190 = 5.263...x.
    await ready(a, "/sentinel/kpi?workspace=" + IDS.alpha, 'select[aria-label="Company"]');
    assert.equal(await tileValue(a, "Market cap (₹ crore"), "1,000");
    assert.equal(await stat(a, "P/E"), "5.26x");
    // EPS = PAT 190 crore x 1e7 / 1 crore shares = 190 rupees; the card says dividend yield is not held, rather than leaving it out silently.
    assert.equal(await tileValue(a, "Earnings per share"), "₹190.00");
    assert.match(await a.locator("body").textContent(), /dividend yield, is not held in Sentinel/);
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
    const history = await db("sentinel_statement_changes", "&workspace_id=eq." + IDS.alpha + "&period_label=eq.FY29");
    assert.equal(history.length, 1, "the save through the server recorded who added the period");
    assert.equal(history[0].action, "created");
  }, a);

  await check("History: the project Overview lists the recent change", async () => {
    await ready(a, "/sentinel/projects/" + IDS.alpha, "[data-testid=change-history]");
    const text = await a.locator("[data-testid=change-history]").innerText();
    assert.match(text, /FY29/);
    assert.match(text, /Added/);
  }, a);

  await check("Scores: Altman Z\u2033 and Beneish M are on the KPI page and say what they need when the lines are missing", async () => {
    await ready(a, "/sentinel/kpi?workspace=" + IDS.alpha, 'select[aria-label="Company"]');
    await a.waitForSelector("text=Key figures");
    assert.equal(await stat(a, "Altman Z\u2033"), "-");
    assert.equal(await stat(a, "Beneish M score"), "-");
    assert.equal(await stat(a, "Piotroski F-Score"), "-");
    const tiles = await a.locator('[data-stat="Altman Z\u2033"]').innerText();
    assert.match(tiles, /Needs retained earnings/);
    assert.match(await a.locator('[data-stat="Piotroski F-Score"]').innerText(), /Needs this and last year/);
  }, a);

  await check("Operating metrics: the owner records one, it is listed with its source, and a reference company shows none", async () => {
    await ready(a, "/sentinel/projects/" + IDS.alpha, '[data-testid="operating-metrics"]');
    await a.getByLabel("Period", { exact: true }).fill("Q3 FY26");
    await a.getByLabel("Value", { exact: true }).fill("13.5");
    await a.getByLabel("Source", { exact: true }).fill("Q3 investor deck, p.12");
    await a.getByRole("button", { name: "Add metric" }).click();
    await a.waitForSelector("text=Saved Attrition (last twelve months) for Q3 FY26.");
    const text = await a.locator('[data-testid="operating-metrics"]').innerText();
    assert.match(text, /Q3 FY26/);
    assert.match(text, /13\.5%/);
    assert.match(text, /Q3 investor deck, p\.12/);
    const [row] = await db("sentinel_operating_metrics", "&workspace_id=eq." + IDS.alpha);
    assert.equal(row.metric, "attrition_pct");
    assert.equal(row.value, 13.5);
    await ready(a, "/sentinel/projects/" + IDS.ref1, "h1");
    assert.equal(await a.locator('[data-testid="operating-metrics"]').count(), 0);
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
