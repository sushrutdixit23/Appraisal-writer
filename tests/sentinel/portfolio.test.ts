// The portfolio: weights worked on paper, the basis fallback, the concern ordering, blind spots, and the broker-file import.

import test from "node:test";
import assert from "node:assert/strict";
import { serialiseNotes, type AnnualNotes } from "../../app/sentinel/lib/autofill/notes";
import { buildPortfolio, exposureLines, findingsFor, parseHoldingsCsv, validateHolding } from "../../app/sentinel/lib/portfolio";
import { near, st, ws } from "./helpers";

const TODAY = "2026-10-30";
const priced = (id: string, price: number | null, over = {}) => ws(id, { owner_id: "me", is_public_reference: false, market_price: price, market_price_as_of: "2026-10-28", ...over });
const notes = (...f: [string, "high" | "medium" | "info"][]): string =>
  serialiseNotes({ read: { ageing: 1, ratios: 0, caro: 0, contingent: 0, maturity: 0, related_parties: 0 }, ratios: [], findings: f.map(([title, severity]) => ({ note: "ageing" as const, id: "x", severity, title, detail: "as printed", page: 12 })) } as AnnualNotes);
const fy = (id: string, n: string | null, over = {}) => st(id, { period_label: "FY26", period_end_date: "2026-03-31", annual_report_notes: n, ...over });

test("weights by market value: 100 x 50, 200 x 10 and 100 x 30 are 5000, 2000, 3000 of 10000", () => {
  const p = buildPortfolio(
    [{ workspace_id: "a", quantity: 100, avg_cost: 40 }, { workspace_id: "b", quantity: 200, avg_cost: 10 }, { workspace_id: "c", quantity: 100, avg_cost: null }],
    [priced("a", 50), priced("b", 10), priced("c", 30)], [], [], TODAY,
  );
  assert.equal(p.basis, "market");
  assert.equal(p.total, 10000);
  const w = Object.fromEntries(p.positions.map((x) => [x.workspace.id, x.weight]));
  assert.ok(near(w.a, 0.5) && near(w.b, 0.2) && near(w.c, 0.3));
  assert.ok(near(p.positions.find((x) => x.workspace.id === "a")!.gain, 0.25)); // 50 / 40 - 1
  assert.equal(p.positions.find((x) => x.workspace.id === "c")!.gain, null);
});

test("one holding without a price drops the whole book to cost weights rather than mixing scales", () => {
  const p = buildPortfolio(
    [{ workspace_id: "a", quantity: 100, avg_cost: 40 }, { workspace_id: "b", quantity: 100, avg_cost: 60 }],
    [priced("a", 50), priced("b", null)], [], [], TODAY,
  );
  assert.equal(p.basis, "cost");
  assert.deepEqual(p.unpriced, ["B"]);
  const w = Object.fromEntries(p.positions.map((x) => [x.workspace.id, x.weight]));
  assert.ok(near(w.a, 0.4) && near(w.b, 0.6)); // 4000 and 6000
});

test("with neither prices nor costs the weights are equal, and the page can say so", () => {
  const p = buildPortfolio([{ workspace_id: "a", quantity: 1, avg_cost: null }, { workspace_id: "b", quantity: 9000, avg_cost: null }], [priced("a", null), priced("b", null)], [], [], TODAY);
  assert.equal(p.basis, "equal");
  assert.ok(p.positions.every((x) => near(x.weight, 0.5)));
});

test("a stale price is flagged but still used", () => {
  const p = buildPortfolio([{ workspace_id: "a", quantity: 10, avg_cost: null }], [priced("a", 100, { market_price_as_of: "2026-10-01" })], [], [], TODAY);
  assert.equal(p.positions[0].price_stale, true);
  assert.equal(p.positions[0].value, 1000);
});

test("concern is weight times points: a high finding is 3, a medium 1, info none, and the list is ordered by it", () => {
  const statements = [
    fy("a", notes(["Receivables over a year old are 40% of the total", "high"])), // 3 points, weight 0.2 -> 0.6
    fy("b", notes(["Borrowings due within a year", "medium"], ["Another", "medium"], ["Info only", "info"])), // 2 points, weight 0.8 -> 1.6
  ];
  const p = buildPortfolio([{ workspace_id: "a", quantity: 20, avg_cost: null }, { workspace_id: "b", quantity: 80, avg_cost: null }], [priced("a", 10), priced("b", 10)], statements, [], TODAY);
  const [first, second] = p.positions;
  assert.equal(first.workspace.id, "b");
  assert.equal(first.points, 2);
  assert.ok(near(first.concern, 1.6) && near(second.concern, 0.6));
  assert.equal(second.findings[0].severity, "high");
  assert.ok(first.findings.every((f) => f.severity !== undefined) && first.findings.length === 2); // the info finding is not carried
});

test("points are capped so one company with many findings cannot swamp the list", () => {
  const many = notes(...(Array.from({ length: 6 }, (_, i) => [`High ${i}`, "high"]) as [string, "high"][]));
  const p = buildPortfolio([{ workspace_id: "a", quantity: 1, avg_cost: null }], [priced("a", 10)], [fy("a", many)], [], TODAY);
  assert.equal(p.positions[0].points, 9);
});

test("blind spots: a holding with no notes read is counted, and 'nothing found' is not credited to it", () => {
  const statements = [fy("a", notes(["x", "high"])), fy("b", null)];
  const p = buildPortfolio([{ workspace_id: "a", quantity: 30, avg_cost: null }, { workspace_id: "b", quantity: 70, avg_cost: null }], [priced("a", 1), priced("b", 1)], statements, [], TODAY);
  assert.ok(near(p.share_high, 0.3));
  assert.ok(near(p.share_blind, 0.7));
  assert.equal(p.positions.find((x) => x.workspace.id === "b")!.notes_year, null);
});

test("an annual statement more than a year and two months old says a newer report may exist", () => {
  const old = fy("a", notes(["x", "medium"]), { period_end_date: "2025-03-31" });
  const fresh = fy("b", null, { period_end_date: "2026-03-31" });
  const p = buildPortfolio([{ workspace_id: "a", quantity: 1, avg_cost: null }, { workspace_id: "b", quantity: 1, avg_cost: null }, { workspace_id: "c", quantity: 1, avg_cost: null }], [priced("a", 1), priced("b", 1), priced("c", 1)], [old, fresh], [], TODAY);
  const status = Object.fromEntries(p.positions.map((x) => [x.workspace.id, x.report_status]));
  assert.deepEqual(status, { a: "newer_may_exist", b: "current", c: "none" });
  assert.ok(near(p.share_newer, 1 / 3));
});

test("a breached covenant is a high finding on the company, a tight one a medium", () => {
  const stmt = fy("a", null, { current_assets: 100, current_liabilities: 200 }); // current ratio 0.5
  const f = findingsFor(priced("a", 1), [stmt], [{ workspace_id: "a", name: "Working capital line", metric: "current_ratio", comparator: "min", limit_value: 1 }], TODAY);
  assert.equal(f.findings.length, 1);
  assert.equal(f.findings[0].source, "covenant");
  assert.equal(f.findings[0].severity, "high");
  const tight = findingsFor(priced("a", 1), [fy("a", null, { current_assets: 110, current_liabilities: 100 })], [{ workspace_id: "a", name: "WC", metric: "current_ratio", comparator: "min", limit_value: 1 }], TODAY);
  assert.equal(tight.findings[0].severity, "medium");
});

test("holdings in a company that is not in the list, or with no quantity, are ignored", () => {
  const p = buildPortfolio([{ workspace_id: "a", quantity: 10, avg_cost: null }, { workspace_id: "gone", quantity: 10, avg_cost: null }, { workspace_id: "a2", quantity: 0, avg_cost: null }], [priced("a", 1), priced("a2", 1)], [], [], TODAY);
  assert.equal(p.positions.length, 1);
});

test("digest lines carry the weight, the page and the count of further findings, and skip positions with nothing", () => {
  const statements = [fy("a", notes(["Receivables over a year old are 40%", "high"], ["Another", "medium"])), fy("b", null)];
  const p = buildPortfolio([{ workspace_id: "a", quantity: 25, avg_cost: null }, { workspace_id: "b", quantity: 75, avg_cost: null }], [priced("a", 10), priced("b", 10)], statements, [], TODAY);
  const lines = exposureLines(p);
  assert.equal(lines.length, 1);
  assert.match(lines[0].title, /^A - 25\.0% of your book: Receivables over a year old/);
  assert.match(lines[0].detail, /\(p\.12\) 1 more finding\./);
  const byCost = buildPortfolio([{ workspace_id: "a", quantity: 25, avg_cost: 4 }], [priced("a", null)], statements, [], TODAY);
  assert.match(exposureLines(byCost)[0].title, /100\.0% of your book \(by cost\)/);
});

// ---- the broker file ----------------------------------------------------------------------------------------------------------

const projects = [
  { id: "tcs", company_name: "Tata Consultancy Services Limited", ticker: "TCS", bse_code: "532540" },
  { id: "inf", company_name: "Infosys Limited", ticker: null, bse_code: "500209" },
  { id: "hcl", company_name: "HCL Technologies", ticker: "HCLTECH", bse_code: null },
  { id: "d1", company_name: "Delta Corp", ticker: null, bse_code: null },
  { id: "d2", company_name: "Delta Corp Ltd", ticker: null, bse_code: null },
];

test("a broker export is matched by BSE code, then ticker, then company name, with Limited and its kin ignored", () => {
  const r = parseHoldingsCsv(["Symbol,Quantity,Avg. cost", "TCS,10,3200.50", "Infosys Ltd,5,1400", "HCLTECH,20,"].join("\n"), projects);
  assert.deepEqual(r.matched.map((m) => [m.workspace_id, m.quantity, m.avg_cost]), [["tcs", 10, 3200.5], ["inf", 5, 1400], ["hcl", 20, null]]);
  assert.deepEqual(r.unmatched, []);
  const byCode = parseHoldingsCsv(["BSE code,Qty,Invested value", "500209,4,6000"].join("\n"), projects);
  assert.deepEqual(byCode.matched.map((m) => [m.workspace_id, m.quantity, m.avg_cost]), [["inf", 4, 1500]]); // 6000 / 4
});

test("a row that matches nothing, is ambiguous, repeats, or has no quantity is returned with its reason, never guessed", () => {
  const r = parseHoldingsCsv(["Company,Quantity", "Unknown Industries,10", "Delta Corp,10", "TCS,5", "TCS,7", "Infosys Limited,0", "\"HCL Technologies\",\"1,200\""].join("\n"), projects);
  assert.deepEqual(r.matched.map((m) => [m.workspace_id, m.quantity]), [["tcs", 5], ["hcl", 1200]]);
  const reasons = Object.fromEntries(r.unmatched.map((u) => [u.label, u.reason]));
  assert.match(reasons["Unknown Industries"], /no project has this/);
  assert.match(reasons["Delta Corp"], /more than one project/);
  assert.match(reasons["TCS"], /appears twice/);
  assert.match(reasons["Infosys Limited"], /quantity is not a positive number/);
});

test("a file with no quantity or no company column is refused with a message, not half-read", () => {
  assert.match(parseHoldingsCsv("Symbol,Price\nTCS,10", projects).errors.join(" "), /No quantity column/);
  assert.match(parseHoldingsCsv("Quantity,Price\n10,10", projects).errors.join(" "), /No company column/);
  assert.match(parseHoldingsCsv("Symbol,Quantity", projects).errors.join(" "), /header row and at least one holding/);
});

test("validateHolding: quantity must be positive, cost zero or more or empty", () => {
  assert.equal(validateHolding({ workspace_id: "a", quantity: 0 }).ok, false);
  assert.equal(validateHolding({ workspace_id: "a", quantity: "10" }).ok, false);
  assert.equal(validateHolding({ workspace_id: "a", quantity: 10, avg_cost: -1 }).ok, false);
  const ok = validateHolding({ workspace_id: "a", quantity: 10, avg_cost: "", notes: "  core  " });
  assert.ok(ok.ok && ok.row.avg_cost === null && ok.row.notes === "core");
});
