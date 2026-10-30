// Starts the in-memory Supabase + Anthropic fake with seeded data, for the browser checks.
//   node scripts/test-sentinel.mjs        (compiles the fake into node_modules/.cache first)
//   node tests/sentinel/e2e/serve-fake.cjs 4010
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const root = path.join(__dirname, "..", "..", "..");
const { FakeBackend } = require(path.join(root, "node_modules/.cache/sentinel-tests/tests/sentinel/fake-backend.js"));

const port = Number(process.argv[2] || 4010);
const b = new FakeBackend();
b.rls = true;

const IDS = {
  A: "00000000-0000-4000-8000-00000000000a",
  B: "00000000-0000-4000-8000-00000000000b",
  alpha: "10000000-0000-4000-8000-000000000001",
  lakh: "10000000-0000-4000-8000-000000000002",
  bravo: "10000000-0000-4000-8000-000000000003",
  ref1: "20000000-0000-4000-8000-000000000001",
  ref2: "20000000-0000-4000-8000-000000000002",
  ref3: "20000000-0000-4000-8000-000000000003",
};
b.addUser("tok-a", IDS.A, "a@example.com");
b.addUser("tok-b", IDS.B, "b@example.com");

const base = { sector: "tyre", industry: null, fiscal_year_start_month: 4, currency: "INR", currency_unit: "INR_CRORE", comparison_basis: "consolidated" };
b.tables.sentinel_workspaces = [
  { id: IDS.ref3, owner_id: null, company_name: "Zenith Reference Tyres", is_public_reference: true, ...base },
  { id: IDS.ref1, owner_id: null, company_name: "Apex Reference Tyres", is_public_reference: true, ...base },
  { id: IDS.bravo, owner_id: IDS.B, company_name: "Bravo Secret Tyres", is_public_reference: false, ...base },
  { id: IDS.ref2, owner_id: null, company_name: "Meridian Reference Tyres", is_public_reference: true, ...base },
  { id: IDS.lakh, owner_id: IDS.A, company_name: "Lakh Industries", is_public_reference: false, ...base, currency_unit: "INR_LAKH", bse_code: "532540" },
  { id: IDS.alpha, owner_id: IDS.A, company_name: "Alpha Tyres", is_public_reference: false, ...base, ticker: null, bse_code: null },
];
const fy = (ws, label, end, rev, ebitda, pbt, pat, extra = {}) => ({
  id: randomUUID(), workspace_id: ws, review_cycle_id: null, period_type: "FY", period_label: label, period_end_date: end, basis: "consolidated",
  revenue_from_operations: rev, ebitda, profit_before_tax: pbt, profit_after_tax: pat, source_file: "seed", source_page: null, extraction_notes: null, ...extra,
});
b.tables.sentinel_statements = [
  fy(IDS.alpha, "FY26", "2026-03-31", 1300, 260, 130, 100, { annual_report_notes: JSON.stringify({ v: 1, r: { ageing: 2, ratios: 9, caro: 8, contingent: 3, maturity: 0, related_parties: 0 }, f: [
    { n: "caro", i: "caro_xi", s: "h", t: "The auditor's CARO answer on fraud is not the clean one (standalone)", d: "Clause (xi): \"(b) A report under sub-section (12) of section 143 of the Companies Act has been filed by us in Form ADT-4.\"", p: 437 },
    { n: "ageing", i: "ageing_over_1y", s: "m", t: "8.5% of trade receivables has been outstanding over a year past its due date", d: "4,970 crore of 58,267 crore gross is over a year overdue.", p: 184 },
    { n: "ratios", i: "ratio_current_ratio", s: "i", t: "Current ratio moved down 29% (2.1 to 1.5)", d: "The company's own disclosure.", p: 128 },
  ] }), annual_report_checks: JSON.stringify({ o: "qualified", f: [{ id: "qualified", s: "high", t: "The auditor has qualified the opinion", d: "The Company has not provided for doubtful advances of Rs 120 crore.", p: 9 }, { id: "contingent", s: "info", t: "A contingent liability is stated with an amount", d: "Contingent liability in respect of tax demands is Rs 506 crore as at March 31, 2026.", p: 31 }] }), total_equity: 600, total_debt: 300, current_assets: 500, current_liabilities: 400, inventory: 100, total_expenses: 1150, trade_receivables: 120 }),
  fy(IDS.alpha, "FY25", "2025-03-31", 1000, 190, 100, 80),
  fy(IDS.ref1, "FY26", "2026-03-31", 1250, 230, 120, 90), fy(IDS.ref1, "FY25", "2025-03-31", 1180, 215, 110, 85),
  fy(IDS.ref2, "FY26", "2026-03-31", 2000, 360, 200, 150), fy(IDS.ref2, "FY25", "2025-03-31", 1900, 340, 190, 142),
  fy(IDS.ref3, "FY26", "2026-03-31", 800, 140, 70, 52), fy(IDS.ref3, "FY25", "2025-03-31", 760, 133, 66, 49),
  fy(IDS.bravo, "FY26", "2026-03-31", 4321, 800, 400, 300), fy(IDS.bravo, "FY25", "2025-03-31", 4000, 700, 350, 260),
];
const qfy = (ws, type, label, end, rev, ebitda, pbt, pat, extra = {}) => ({
  id: randomUUID(), workspace_id: ws, review_cycle_id: null, period_type: type, period_label: label, period_end_date: end, basis: "consolidated",
  revenue_from_operations: rev, ebitda, profit_before_tax: pbt, profit_after_tax: pat, tax_expense: pbt - pat, source_file: "seed", source_page: null, extraction_notes: null, ...extra,
});
b.tables.sentinel_statements.push(
  qfy(IDS.alpha, "Q2", "Q2 FY27", "2026-09-30", 400, 80, 60, 45), qfy(IDS.alpha, "Q1", "Q1 FY27", "2026-06-30", 380, 74, 55, 41), qfy(IDS.alpha, "Q2", "Q2 FY26", "2025-09-30", 350, 66, 50, 37),
  qfy(IDS.ref1, "Q2", "Q2 FY27", "2026-09-30", 330, 62, 48, 36), qfy(IDS.ref1, "Q2", "Q2 FY26", "2025-09-30", 300, 54, 42, 31), qfy(IDS.ref1, "Q1", "Q1 FY27", "2026-06-30", 320, 60, 46, 34),
  qfy(IDS.ref2, "Q2", "Q2 FY27", "2026-09-30", 520, 100, 78, 58), qfy(IDS.ref2, "Q2", "Q2 FY26", "2025-09-30", 480, 90, 70, 52), qfy(IDS.ref2, "Q1", "Q1 FY27", "2026-06-30", 500, 96, 74, 55),
);
// Rows as the database returns them: every column present, arrays defaulting to empty.
const invDefaults = { review_cycle_id: null, statement_id: null, initial_hypothesis: "Hypothesis", named_peer: null, possible_causes: [], financial_impact: null, confidence_signals: { flag_count: 2, corroborating_flag_types: 1, max_severity: 1.5, peer_sample_size: 4 }, suggested_questions: [], suggested_actions: [], reviewer_notes: null, archived_at: null };
b.tables.sentinel_investigations = [
  { id: randomUUID(), workspace_id: IDS.alpha, owner_id: IDS.A, period_label: "FY26", status: "approved", observation: [], ...invDefaults, ai_narrative: "**Company specific**\n\nDraft", final_narrative: "**Company specific**\n\nSigned off", confidence_score: 70, created_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-01T00:00:00Z" },
  { id: randomUUID(), workspace_id: IDS.alpha, owner_id: IDS.A, period_label: "FY25", status: "pending", observation: [], ...invDefaults, ai_narrative: "Draft", final_narrative: null, confidence_score: 50, created_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-01T00:00:00Z" },
  { id: randomUUID(), workspace_id: IDS.alpha, owner_id: IDS.A, period_label: "FY24", status: "rejected", observation: [], ...invDefaults, ai_narrative: "Draft", final_narrative: null, confidence_score: 40, created_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-01T00:00:00Z" },
];
b.tables.sentinel_filings = [
  { id: randomUUID(), workspace_id: IDS.lakh, source: "bse", external_id: "n1", kind: "results", headline: "Financial Results for the quarter ended September 30, 2026", filed_at: "2026-10-09T17:05:11", url: "https://www.bseindia.com/x", status: "new" },
  { id: randomUUID(), workspace_id: IDS.bravo, source: "bse", external_id: "n2", kind: "results", headline: "Bravo results", filed_at: "2026-10-10T17:05:11", url: null, status: "new" },
];
// Alpha FY26 carries debt 300 on equity 600 (0.50x) and current assets 500 on current liabilities 400 (1.25x): one covenant tight, one breached.
b.tables.sentinel_covenants = [
  { id: randomUUID(), workspace_id: IDS.alpha, owner_id: IDS.A, name: "Term loan A", metric: "debt_equity", comparator: "max", limit_value: 0.55, next_test_date: null, notes: null, created_at: "2026-01-01T00:00:00Z" },
  { id: randomUUID(), workspace_id: IDS.alpha, owner_id: IDS.A, name: "Working capital line", metric: "current_ratio", comparator: "min", limit_value: 1.5, next_test_date: "2027-03-31", notes: "tested half-yearly", created_at: "2026-01-02T00:00:00Z" },
];
b.tables.sentinel_review_cycles = [];
b.tables.sentinel_recommendations = [];

// What the fake model says when the browser uploads a filing (see fixtures in tests/sentinel/pdf-fixtures.ts).
const extractionReply = () => ({
  text: JSON.stringify({
    period_type: "FY", period_label: "FY26", period_end_date: "2026-03-31", basis: "consolidated", unit: "crore",
    fields: {
      revenue_from_operations: 1000, other_income: 50, total_income: 1050, total_expenses: 900, finance_costs: 20,
      depreciation_amortisation: 60, exceptional_items: 30, profit_before_tax: 120, tax_expense: 30, profit_after_tax: 90,
      total_assets: 2000, current_assets: 800, trade_receivables: 150, inventory: 250, cash_and_equivalents: 90, fixed_assets: 1100,
      total_liabilities: 900, current_liabilities: 450, trade_payables: 180, total_equity: 1100, total_debt: 400, ebitda: 175,
      cash_from_operations: 140, cash_from_investing: -210, cash_from_financing: 60, capex: 190,
    },
    extraction_notes: "Used the year ended 31 March 2026 column.", low_confidence_fields: [],
  }),
});
b.anthropicReply = (body) => {
  if (String(body.system || "").includes("extract financial statement")) return extractionReply();
  if (String(body.system || "").includes("earnings-call transcript")) {
    const first = String(body.messages[0].content).includes("Quarter: Q1 FY27");
    const it = (topic, kind, direction, statement, quote) => ({ topic, kind, direction, statement, quote, speaker: null });
    return { text: JSON.stringify({ items: first ? [
      it("outlook", "outlook", "negative", "Management is cautious about the second half.", "We are cautious about the second half given the weak demand in several verticals."),
      it("people", "commentary", "negative", "Attrition stayed high at 14.8%.", "Attrition remained elevated at 14.8% during the quarter."),
    ] : [
      it("outlook", "guidance", "positive", "Management expects 4-6% revenue growth in the second half.", "We expect revenue growth of 4 to 6 percent in the second half"),
      it("people", "commentary", "positive", "Attrition came down to 12.5%.", "Attrition has come down to 12.5% and we expect it to stay below 13% through the year."),
      it("demand", "risk", "negative", "Banking clients are cautious and decisions are slower.", "Client budgets in the banking vertical remain cautious and decisions are taking longer than before."),
      it("outlook", "outlook", "positive", "Management expects a record quarter next.", "we expect a record quarter next time round for sure"),
    ] }) };
  }
  const n = body.messages.length;
  if (n === 1) return { text: "Initial hypothesis: growth looks company specific." };
  if (n === 3) return { text: "**Rules out sector-wide effect**\n\nAlpha outgrew its peer set." };
  return { text: JSON.stringify({ questions: ["Was there a one-off order?"], recommendations: [{ title: "Check order book", priority: "High", business_value: "Confirms durability", owner: "Finance Head", timeline: "0-2 weeks", difficulty: "Easy" }] }) };
};

b.start(port).then((url) => {
  console.log("FAKE_BACKEND_READY " + url);
});
module.exports = { IDS };
