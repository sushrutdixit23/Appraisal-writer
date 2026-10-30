// Contingent liabilities, against the real FY26 notes of TCS (prose), Infosys, Tech Mahindra, Wipro and HCLTech (tables), and synthetic text for the noise a real
// report contains. A contingent liability is not on the balance sheet, so the reader must not mistake a revenue sentence, a column header, or a capital commitment
// for one.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contingentFindings, readContingentLiabilities } from "../../app/sentinel/lib/autofill/notes/contingent";

const load = (co: string) => JSON.parse(readFileSync(join(process.cwd(), "tests", "sentinel", "fixtures", "notes", `contingent-${co}.json`), "utf-8")) as { num: number; text: string }[];

test("TCS (prose): tax demands of 506 crore against 1,012 the year before, and 318 crore of tax contingencies the seller indemnifies - and a revenue sentence is not one", () => {
  const items = readContingentLiabilities(load("tcs"));
  const stated = items.filter((i) => i.kind === "sentence").map((i) => [i.subject, i.current, i.prior, i.years, i.unit, i.page]);
  assert.deepEqual(stated, [["tax demands", 506, 1012, [2026, 2025], "crore", 305], ["tax contingencies", 318, 318, [2026, 2025], "crore", 305]]);
  assert.ok(items.every((i) => i.page === 305), "the revenue/customer paragraph on page 226 was read as a contingent liability");
});

test("Infosys (table): claims against the company not acknowledged as debts, 1,944 crore against 1,772; the column header '2026 2025' and capital commitments are not rows", () => {
  const items = readContingentLiabilities(load("infosys"));
  assert.deepEqual(items.map((i) => [i.subject, i.current, i.prior]), [["Claims against the Company, not acknowledged as debts(1)", 1944, 1772]]);
});

test("Tech Mahindra (table, million): four tax matters that add up to the total, 31,898 against 31,500", () => {
  const items = readContingentLiabilities(load("tml"));
  const rows = items.filter((i) => i.kind === "table_row");
  assert.deepEqual(rows.map((r) => [r.current, r.prior]), [[13343, 13125], [14930, 15267], [2346, 2905], [1279, 203]]);
  const total = items.find((i) => i.kind === "table_total")!;
  assert.deepEqual([total.current, total.prior, total.unit], [31898, 31500, "million"]);
});

test("Wipro: guarantees given on behalf of subsidiaries are the large item - 74,635 million against 67,300", () => {
  const rows = readContingentLiabilities(load("wipro")).filter((i) => i.kind === "table_row");
  assert.deepEqual(rows.map((r) => [r.subject, r.current, r.prior]).at(-1), ["Guarantees given by the Company on behalf of subsidiaries", 74635, 67300]);
});

test("HCLTech: capital commitments that share the heading are left out, and the printed total (which counts them) is not used", () => {
  const items = readContingentLiabilities(load("hcl"));
  assert.deepEqual(items.map((i) => [i.subject, i.current, i.prior]), [["Others", 346, 346]]);
});

test("findings rank by share of net worth only when net worth is known: 10% medium, 25% high; unknown is information", () => {
  const items = readContingentLiabilities(load("tcs")).filter((i) => i.kind === "sentence");
  assert.ok(contingentFindings(items).every((f) => f.severity === "info"));
  const ranked = contingentFindings(items, 1000); // 506 crore of 1,000 crore is 50.6%
  assert.equal(ranked[0].severity, "high");
  assert.match(ranked[0].title, /Contingent liability - tax demands: 506 crore \(1,012 crore the year before, -50%\)/);
  assert.match(ranked[0].detail, /50\.6% of net worth/);
  assert.equal(contingentFindings(items, 10000)[0].severity, "info"); // 5.1%
  assert.equal(contingentFindings(items, 3000)[0].severity, "medium"); // 16.9%
});

test("policy wording and amounts that are not a pair are not read: 'an amount of 86 crore has been reduced from contingent liabilities' is a past change, not a balance", () => {
  const page = { num: 1, text: "Upon resolution of the disputes, an amount aggregating to `86 crore has been reduced from contingent liabilities. Contingent liabilities are not recognised." };
  assert.deepEqual(readContingentLiabilities([page]), []);
});
