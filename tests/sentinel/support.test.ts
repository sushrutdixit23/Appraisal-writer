// Small shared helpers: access rules, file names, ordinals, applying an extraction to a form, and the
// form-to-row path the browser pages use.

import test from "node:test";
import assert from "node:assert/strict";
import { accessLevel, canRead, canWrite, isUuid, readableWorkspaceFilter, sortWorkspaces, workspaceOptionLabel } from "../../app/sentinel/lib/access";
import { applyExtractionResult } from "../../app/sentinel/lib/extraction";
import { ordinal } from "../../app/sentinel/lib/format";
import { safeFilename } from "../../app/sentinel/lib/server";
import { prepareFromForm } from "../../app/sentinel/lib/validate";

const U1 = "00000000-0000-4000-8000-000000000001";
const U2 = "00000000-0000-4000-8000-000000000002";

test("access: owners write, reference companies are read-only, everyone else gets nothing", () => {
  assert.equal(accessLevel({ owner_id: U1, is_public_reference: false }, U1), "write");
  assert.equal(accessLevel({ owner_id: U1, is_public_reference: false }, U2), "none");
  assert.equal(accessLevel({ owner_id: null, is_public_reference: true }, U2), "read");
  assert.equal(accessLevel({ owner_id: null, is_public_reference: false }, U2), "none");
  assert.ok(canRead({ owner_id: null, is_public_reference: true }, U1));
  assert.ok(!canWrite({ owner_id: null, is_public_reference: true }, U1));
  // An owner id of null never matches a caller, even a caller whose id is somehow empty.
  assert.equal(accessLevel({ owner_id: null, is_public_reference: false }, ""), "none");
});

test("access: the filter built for the peer set only accepts a real user id", () => {
  assert.equal(readableWorkspaceFilter(U1), `is_public_reference.eq.true,owner_id.eq.${U1}`);
  for (const bad of ["", "x", "1,or=(id.neq.0)", `${U1},owner_id.neq.x`, "'; drop table x; --"]) {
    assert.throws(() => readableWorkspaceFilter(bad), /malformed user id/, bad);
  }
  assert.ok(isUuid(U1));
  assert.ok(!isUuid("not-a-uuid") && !isUuid(null) && !isUuid(5));
});

test("access: pickers list your companies first, then reference ones, each A-Z, and label the reference ones", () => {
  const list = [
    { company_name: "zeta", owner_id: null, is_public_reference: true },
    { company_name: "Beta", owner_id: U1, is_public_reference: false },
    { company_name: "alpha", owner_id: null, is_public_reference: true },
    { company_name: "Alpha Own", owner_id: U1, is_public_reference: false },
  ];
  const sorted = sortWorkspaces(list, U1);
  assert.deepEqual(sorted.map((w) => w.company_name), ["Alpha Own", "Beta", "alpha", "zeta"]);
  assert.equal(workspaceOptionLabel(sorted[0], U1), "Alpha Own");
  assert.equal(workspaceOptionLabel(sorted[2], U1), "alpha (reference)");
  assert.deepEqual(list.map((w) => w.company_name), ["zeta", "Beta", "alpha", "Alpha Own"], "the input is not reordered in place");
});

test("file names: whatever the company is called, the header stays valid", () => {
  assert.equal(safeFilename("Apollo Tyres Ltd"), "Apollo_Tyres_Ltd");
  assert.equal(safeFilename('Alpha "India" Ltd\r\nX-Injected: 1'), "Alpha_India_Ltd_X-Injected_1");
  assert.equal(safeFilename("../../etc/passwd"), "etc_passwd");
  assert.equal(safeFilename("₹तेस्ट"), "company"); // nothing usable left -> fallback
  assert.equal(safeFilename("", "FY"), "FY");
  assert.ok(safeFilename("x".repeat(500)).length <= 80);
  assert.match(safeFilename("Café Coffee Day"), /^Cafe_Coffee_Day$/);
});

test("ordinals", () => {
  const got = [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 50, 67, 100, 101, 111].map(ordinal);
  assert.deepEqual(got, ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "50th", "67th", "100th", "101st", "111th"]);
  assert.equal(ordinal(66.7), "67th");
  assert.equal(ordinal(0), "0th");
});

test("extraction applied to a form: converted from the filing's unit to the company's, with a note", () => {
  const draft = { fields: { revenue_from_operations: 1000, cash_from_investing: -210, capex: 190.5 }, unit: "INR_CRORE" as const, unit_source: "page" as const };
  const lakh = applyExtractionResult(draft, "INR_LAKH");
  assert.deepEqual(lakh.values, { revenue_from_operations: "100000", cash_from_investing: "-21000", capex: "19050" });
  assert.match(lakh.unitNote ?? "", /filing is in .*Crore.*converted to .*Lakh/);
  const same = applyExtractionResult(draft, "INR_CRORE");
  assert.equal(same.values.revenue_from_operations, "1000");
  assert.equal(same.unitNote, null);
  const legacy = applyExtractionResult(draft, "cr"); // a company stored with the old spelling
  assert.equal(legacy.unitNote, null);
  const million = applyExtractionResult({ ...draft, unit: "INR_MILLION" }, "INR_CRORE");
  assert.equal(million.values.revenue_from_operations, "100"); // 1000 million = 100 crore
});

test("extraction applied with no known unit: figures are left exactly as printed and the note says to check", () => {
  const r = applyExtractionResult({ fields: { revenue_from_operations: 1000 }, unit: null, unit_source: "none" }, "INR_LAKH");
  assert.equal(r.values.revenue_from_operations, "1000");
  assert.match(r.unitNote ?? "", /could not be determined/);
});

test("the model's own unit reading is labelled as such in the note", () => {
  const r = applyExtractionResult({ fields: { revenue_from_operations: 5 }, unit: "INR_LAKH", unit_source: "model" }, "INR_CRORE");
  assert.match(r.unitNote ?? "", /model's reading, not confirmed on the page/);
});

test("form to row: figures with commas become numbers, blanks stay null, and the row is ready to insert", () => {
  const p = prepareFromForm(
    { periodType: "FY", periodLabel: "FY26", periodEndDate: "2026-03-31", basis: "consolidated", sourceFile: "x.pdf", extractionNotes: null,
      values: { revenue_from_operations: "1,000", profit_before_tax: "(100)", profit_after_tax: "-90", inventory: "" } },
    []
  );
  assert.deepEqual(p.errors, []);
  assert.equal(p.row?.revenue_from_operations, 1000);
  assert.equal(p.row?.profit_before_tax, -100);
  assert.equal(p.row?.inventory, null);
  assert.equal(p.row?.source_file, "x.pdf");
});

test("form to row: every problem comes back in the form's own words", () => {
  const base = { periodType: "FY", periodLabel: "FY26", periodEndDate: "2026-03-31", basis: "consolidated", sourceFile: "m", extractionNotes: null };
  const text = prepareFromForm({ ...base, values: { revenue_from_operations: "abc", profit_before_tax: "1", profit_after_tax: "1", inventory: "x" } }, []);
  assert.equal(text.row, null);
  assert.deepEqual(text.errors, ["Revenue from operations is not a number.", "Inventory is not a number."]);
  const missing = prepareFromForm({ ...base, periodLabel: "", periodEndDate: "", values: { revenue_from_operations: "1", profit_before_tax: "1" } }, []);
  assert.deepEqual(missing.errors, ["Period label is required.", "Period end date is required.", "Profit after tax is required."]);
  const unbalanced = prepareFromForm({ ...base, values: { revenue_from_operations: "1", profit_before_tax: "1", profit_after_tax: "1", total_assets: "600", total_liabilities: "350", total_equity: "200" } }, []);
  assert.equal(unbalanced.row, null);
  assert.match(unbalanced.errors[0], /does not balance/);
  assert.deepEqual(unbalanced.issues[0].fields, ["total_assets", "total_liabilities", "total_equity"]);
});

test("form to row: warnings come through with a valid row", () => {
  const p = prepareFromForm(
    { periodType: "FY", periodLabel: "FY26", periodEndDate: "2026-03-31", basis: "consolidated", sourceFile: "m", extractionNotes: null,
      values: { revenue_from_operations: "1000", profit_before_tax: "100", profit_after_tax: "80", total_equity: "-5" } },
    []
  );
  assert.ok(p.row);
  assert.match(p.warnings.join(" "), /Total equity is negative/);
});
