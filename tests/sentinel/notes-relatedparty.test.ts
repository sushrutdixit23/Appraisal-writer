// The related-party reader, against the real FY26 matrices of TCS and Tech Mahindra. A row is read only when its party columns add up to its total. Infosys, Wipro and
// HCLTech print the note in a layout this does not read (a list per party), and the tests say so: reading nothing is the right answer, not a guess.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readRelatedParties, relatedPartyFindings } from "../../app/sentinel/lib/autofill/notes/relatedParty";

const load = (co: string) => JSON.parse(readFileSync(join(process.cwd(), "tests", "sentinel", "fixtures", "notes", `rpt-${co}.json`), "utf-8")) as { num: number; text: string }[];
const row = (co: string, page: number, kind: string, nth = 0) => readRelatedParties(load(co)).find((t) => t.page === page)!.rows.filter((r) => r.kind === kind)[nth];

test("TCS standalone, year ended 31 March 2026: revenue 37,508 crore from related parties across five party columns that add up, 1,511 crore of deposits placed, 226 crore of guarantees", () => {
  const [t] = readRelatedParties(load("tcs"));
  assert.deepEqual([t.page, t.year_hint, t.unit], [310, 2026, "crore"]);
  assert.deepEqual(row("tcs", 310, "revenue").columns, [78, 31189, 1354, 4887, 0]);
  assert.equal(row("tcs", 310, "revenue").total, 37508);
  assert.equal(row("tcs", 310, "guarantee_given").total, 226);
  assert.deepEqual(t.rows.filter((r) => r.kind === "loan_given").map((r) => [r.label, r.total]), [["Loans and advances given", 34], ["Inter-corporate deposits placed", 1511]]);
  // the label wrapped over two lines above its figures is joined
  assert.match(t.rows.find((r) => r.kind === "purchase")!.label, /^Purchases of goods and services \(including reimbursements\)$/);
  assert.equal(t.rows.find((r) => r.kind === "dividend_paid")!.total, 28305);
  // "Loans and advances recovered" is a recovery, not an exposure created
  assert.ok(!t.rows.find((r) => /recovered/.test(r.label) && r.kind === "loan_given"));
});

test("every row read adds up: the party columns equal the total, to within rounding", () => {
  for (const t of readRelatedParties(load("tcs")).concat(readRelatedParties(load("tml")))) {
    for (const r of t.rows) assert.ok(Math.abs(r.columns.reduce((a, b) => a + b, 0) - r.total) <= Math.max(2, r.total * 0.002), `${t.page}: ${r.label}`);
  }
});

test("Tech Mahindra (million): 44,878 of revenue from related parties, mostly subsidiaries; a 16,709 million guarantee on the following page", () => {
  const rev = row("tml", 526, "revenue");
  assert.deepEqual([rev.columns, rev.total], [[3664, 40778, 436, 0, 0], 44878]);
  assert.equal(row("tml", 528, "guarantee_given").total, 16709);
});

test("exposure is ranked against net worth when it is known (34 + 226 + 1,511 = 1,771 crore): 17.7% of 10,000 is high; unknown net worth is information", () => {
  const tables = readRelatedParties(load("tcs"));
  const info = relatedPartyFindings(tables).find((f) => f.id === "rpt_exposure")!;
  assert.equal(info.severity, "info");
  assert.match(info.title, /1,771 crore\b/);
  const ranked = relatedPartyFindings(tables, { net_worth: 10000 }).find((f) => f.id === "rpt_exposure")!;
  assert.equal(ranked.severity, "high");
  assert.match(ranked.title, /\(17\.7% of net worth\)/);
  assert.equal(relatedPartyFindings(tables, { net_worth: 100000 }).find((f) => f.id === "rpt_exposure")!.severity, "info"); // 1.8%
});

test("revenue from related parties is compared with the company's own revenue only when that is supplied: 37,508 of 100,000 is 38%, medium; of 60,000 is 63%, high", () => {
  const tables = readRelatedParties(load("tcs"));
  assert.equal(relatedPartyFindings(tables, { revenue: 100000 }).find((f) => f.id === "rpt_revenue")!.severity, "medium");
  const high = relatedPartyFindings(tables, { revenue: 60000 }).find((f) => f.id === "rpt_revenue")!;
  assert.equal(high.severity, "high");
  assert.match(high.title, /\(63% of the company's revenue\)/);
  assert.equal(relatedPartyFindings(tables, { revenue: 1_000_000 }).find((f) => f.id === "rpt_revenue"), undefined); // 3.8%: not worth a line
});

test("Infosys, Wipro and HCLTech print this note as a list per party: nothing is read, rather than something wrong", () => {
  for (const co of ["infosys", "wipro", "hcl"]) assert.deepEqual(readRelatedParties(load(co)), [], co);
});

test("a table with a total column that is not related-party transactions (a page that only mentions a subsidiary) is not read", () => {
  const page = { num: 1, text: ["Segment revenue by geography", ...Array.from({ length: 8 }, (_, i) => `Region ${i} \t10 \t20 \t30 \t60`)].join("\n") };
  assert.deepEqual(readRelatedParties([page]), []);
});
