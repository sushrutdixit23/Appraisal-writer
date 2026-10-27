// The evaluation scorer, on fixtures only (no real filings, no model call).

import test from "node:test";
import assert from "node:assert/strict";
import {
  bootstrapByFiling,
  checkTargets,
  classify,
  itemRecords,
  percentile,
  score,
  summarize,
  wilson,
} from "../../app/sentinel/lib/evaluation/scoring";
import { validateGroundTruth } from "../../app/sentinel/lib/evaluation/groundTruth";
import type { Filing, GroundTruth, GroundTruthItem, Prediction, Truth } from "../../app/sentinel/lib/evaluation/types";

const close = (a: number | null, b: number, tol = 1e-6) => {
  assert.ok(a != null, `expected a number near ${b}, got null`);
  assert.ok(Math.abs(a - b) < tol, `${a} is not within ${tol} of ${b}`);
};

// --- wilson / percentile -------------------------------------------------------------------

test("wilson: hand-worked intervals, and null with nothing to estimate from", () => {
  const a = wilson(8, 10)!;
  close(a[0], 0.49015684672072346);
  close(a[1], 0.9433190520193067);
  const b = wilson(0, 5)!;
  close(b[0], 0, 1e-9);
  close(b[1], 0.43449149475208104);
  assert.equal(wilson(0, 0), null);
});

test("percentile: nearest rank, not an average - p50 of an odd list is a real element", () => {
  const xs = [5, 1, 3, 2, 4];
  assert.equal(percentile(xs, 50), 3);
  assert.equal(percentile(xs, 2.5), 1); // ceil(0.025*5)=1 -> the smallest
  assert.equal(percentile(xs, 97.5), 5); // ceil(0.975*5)=5 -> the largest
  assert.equal(percentile([], 50), null);
});

// --- classify -------------------------------------------------------------------------------

const truth = (over: Partial<Truth> = {}): Truth => ({ is_absent: false, value: null, unit: "INR_CRORE", pdf_page: 2, ...over });
const item = (over: Partial<GroundTruthItem> = {}, truthOver: Partial<Truth> = {}): GroundTruthItem => ({
  item_id: "i1",
  filing_id: "f1",
  field: "revenue_from_operations",
  basis: "consolidated",
  split: "dev",
  item_class: "stated",
  adjudication: { status: "agree", annotations: 2, truth: truth(truthOver) },
  ...over,
});
const pred = (over: Partial<Prediction> = {}): Prediction => ({
  filing_id: "f1",
  fields: {},
  low_confidence_fields: [],
  grounding: {},
  unit: "INR_CRORE",
  pages_used: [2],
  ...over,
});

test("no prediction for the filing at all is missed, whatever the truth says", () => {
  assert.equal(classify(item({}, { value: 1000 }), null), "missed");
  assert.equal(classify(item({}, { value: 1000 }), undefined), "missed");
});

test("truth and prediction agree the field is absent: correct", () => {
  assert.equal(classify(item({}, { is_absent: true }), pred()), "correct");
});

test("the field is genuinely absent but the model supplied a value anyway: invented", () => {
  assert.equal(classify(item({}, { is_absent: true }), pred({ fields: { revenue_from_operations: 1 } })), "invented");
});

test("truth has a value, the model gave none: missed when silent, abstained when it said so", () => {
  const truthHasValue = item({}, { value: 1000 });
  assert.equal(classify(truthHasValue, pred()), "missed");
  assert.equal(classify(truthHasValue, pred({ low_confidence_fields: ["revenue_from_operations"] })), "abstained");
});

test("a value that is not within tolerance of the truth, in the truth's own unit, is wrong_value", () => {
  assert.equal(classify(item({}, { value: 1000 }), pred({ fields: { revenue_from_operations: 999 } })), "wrong_value");
});

test("the right value survives a unit conversion: 1,000 lakh truth matches a 10 crore prediction", () => {
  const truthInLakh = item({}, { value: 100000, unit: "INR_LAKH" });
  assert.equal(classify(truthInLakh, pred({ fields: { revenue_from_operations: 1000 } })), "correct");
});

test("the value is right but the cited row has a grounding flag: wrong_citation, not correct", () => {
  const p = pred({ fields: { revenue_from_operations: 1000 }, grounding: { revenue_from_operations: ["value_not_in_quote"] } });
  assert.equal(classify(item({}, { value: 1000 }), p), "wrong_citation");
});

test("the value is right but the model read a different page than the one truth cites: wrong_citation", () => {
  const p = pred({ fields: { revenue_from_operations: 1000 }, pages_used: [5] });
  assert.equal(classify(item({}, { value: 1000 }), p), "wrong_citation");
});

test("an item with no true page never fails on page grounding - only the value and quote matter", () => {
  const p = pred({ fields: { revenue_from_operations: 1000 }, pages_used: [99] });
  assert.equal(classify(item({}, { value: 1000, pdf_page: null }), p), "correct");
});

// --- itemRecords / summarize ------------------------------------------------------------------

const gt1: GroundTruth = {
  held_out_company: "ACME",
  filings: [
    { filing_id: "acme-fy26", company_id: "ACME", page_count: 10 },
    { filing_id: "beta-fy26", company_id: "BETA", page_count: 10 },
  ],
  items: [
    item({ item_id: "r1", filing_id: "acme-fy26", field: "revenue_from_operations", split: "test" }, { value: 1000 }),
    item({ item_id: "pat1", filing_id: "acme-fy26", field: "profit_after_tax", split: "test" }, { value: 90 }),
    item({ item_id: "abs1", filing_id: "acme-fy26", field: "exceptional_items", split: "test" }, { is_absent: true }),
    item({ item_id: "r2", filing_id: "beta-fy26", field: "revenue_from_operations", split: "dev" }, { value: 500 }),
  ],
};
const preds1: Prediction[] = [
  pred({ filing_id: "acme-fy26", fields: { revenue_from_operations: 1000, profit_after_tax: 80 } }), // r1 correct, pat1 wrong_value, abs1 correct (no value)
  pred({ filing_id: "beta-fy26", fields: { revenue_from_operations: 500 } }), // r2 correct
];

test("itemRecords reads one outcome per scored item, matched by filing_id", () => {
  const records = itemRecords(gt1, preds1);
  const byId = Object.fromEntries(records.map((r) => [r.item_id, r.outcome]));
  assert.deepEqual(byId, { r1: "correct", pat1: "wrong_value", abs1: "correct", r2: "correct" });
});

test("summarize: coverage, precision and null_accuracy on a small, hand-counted set", () => {
  const records = itemRecords(gt1, preds1);
  const s = summarize(records.filter((r) => r.split === "test")); // r1, pat1, abs1
  assert.equal(s.n, 3);
  assert.equal(s.counts.correct, 2);
  assert.equal(s.counts.wrong_value, 1);
  close(s.coverage!, 1); // nothing abstained
  close(s.precision_accepted!, 2 / 3);
  assert.equal(s.null_n, 1);
  close(s.null_accuracy!, 1); // the one absent item (abs1) was correctly left blank
});

test("an abstained item is excluded from the accepted denominator but still counted in n", () => {
  const withGap = itemRecords(
    { ...gt1, items: [...gt1.items, item({ item_id: "gap", filing_id: "acme-fy26", field: "total_income", split: "test" }, { value: 2000 })] },
    [pred({ filing_id: "acme-fy26", fields: { revenue_from_operations: 1000, profit_after_tax: 80 }, low_confidence_fields: ["total_income"] }), preds1[1]]
  );
  const s = summarize(withGap.filter((r) => r.split === "test"));
  assert.equal(s.n, 4);
  assert.equal(s.counts.abstained, 1);
  close(s.coverage!, 3 / 4);
  close(s.precision_accepted!, 2 / 3); // accepted = correct(2) + wrong_value(1) = 3; correct = 2
});

test("locate_accuracy ignores items with no true page and is exact on the rest", () => {
  const withNoPage = itemRecords(
    { ...gt1, items: [item({ item_id: "noPage", filing_id: "acme-fy26", field: "tax_expense", split: "test" }, { value: 30, pdf_page: null })] },
    [pred({ filing_id: "acme-fy26", fields: { tax_expense: 30 }, pages_used: [99] })]
  );
  const s = summarize(withNoPage);
  assert.equal(s.locate_accuracy, null);
});

// --- bootstrap --------------------------------------------------------------------------------

test("bootstrapByFiling needs at least two filings to resample, and is reproducible for a fixed seed", () => {
  const oneFiling = itemRecords(
    { ...gt1, filings: [gt1.filings[0]], items: gt1.items.filter((i) => i.filing_id === "acme-fy26") },
    [preds1[0]]
  );
  assert.equal(bootstrapByFiling(oneFiling), null);

  const records = itemRecords(gt1, preds1);
  const a = bootstrapByFiling(records, 500, 7);
  const b = bootstrapByFiling(records, 500, 7);
  assert.deepEqual(a, b);
  const [lo, hi] = a!;
  assert.ok(lo >= 0 && hi <= 1 && lo <= hi, `[${lo}, ${hi}]`);
});

// --- checkTargets -----------------------------------------------------------------------------

test("checkTargets: T1-T4 pass or fail on exactly the thresholds in TARGETS", () => {
  // precision 2/3 fails T1 (0.98); coverage 1 passes T2 (0.80); one invented value fails T3;
  // both filings have their true page located, so T4 passes.
  const records = itemRecords(gt1, preds1);
  const testRecords = records.filter((r) => r.split === "test");
  const checks = checkTargets(testRecords, records);
  assert.equal(checks.T1_precision_accepted.passed, false);
  assert.equal(checks.T2_coverage.passed, true);
  assert.equal(checks.T3_no_invented_values.passed, true);
  assert.equal(checks.T4_all_filings_located.passed, true);

  const withInvented = itemRecords(
    { ...gt1, items: [...gt1.items, item({ item_id: "inv", filing_id: "acme-fy26", field: "tax_expense", split: "test" }, { is_absent: true })] },
    [pred({ filing_id: "acme-fy26", fields: { revenue_from_operations: 1000, profit_after_tax: 80, tax_expense: 5 } }), preds1[1]]
  );
  assert.equal(checkTargets(withInvented.filter((r) => r.split === "test"), withInvented).T3_no_invented_values.passed, false);
});

// --- score: the grouping/rollup shape end to end -----------------------------------------------

test("score groups by split, company and class, and only test-split items feed targets_on_test", () => {
  const report = score(gt1, preds1);
  assert.equal(report.groups.all.n, 4);
  assert.equal(report.groups.test.n, 3);
  assert.equal(report.groups.dev.n, 1);
  assert.deepEqual(Object.keys(report.by_company).sort(), ["ACME", "BETA"]);
  assert.equal(report.by_company.ACME.n, 3);
  assert.equal(report.by_company.BETA.n, 1);
  assert.equal(report.targets_on_test.T1_precision_accepted.value, report.groups.test.precision_accepted);
  assert.equal(report.records.length, 4);
});

// --- validateGroundTruth -----------------------------------------------------------------------

const filing = (over: Partial<Filing> = {}): Filing => ({ filing_id: "f1", company_id: "ACME", page_count: 10, ...over });
const validGt = (): GroundTruth => ({
  held_out_company: "ACME",
  filings: [filing()],
  items: [item({ split: "test" }, { value: 1000 })],
});

test("a well-formed file raises nothing", () => {
  assert.deepEqual(validateGroundTruth(validGt()), []);
});

test("duplicate filing_id and item_id are both caught", () => {
  const gt = validGt();
  gt.filings.push(filing());
  gt.items.push(item({ item_id: "i1" }, { value: 1 }));
  const errs = validateGroundTruth(gt);
  assert.ok(errs.includes("duplicate filing_id"));
  assert.ok(errs.includes("duplicate item_id"));
});

test("held_out_company unset is caught", () => {
  const gt = validGt();
  gt.held_out_company = null;
  assert.ok(validateGroundTruth(gt).includes("held_out_company is not set"));
});

test("a split that does not match whether its company is the held-out one is caught", () => {
  const gt = validGt(); // ACME is held out, so its item should be split "test"
  gt.items[0].split = "dev";
  assert.ok(validateGroundTruth(gt).includes("i1: split should be test"));
});

test("is_absent inconsistent with value, a missing unit, and an out-of-range page are all caught", () => {
  const gt = validGt();
  gt.items[0].adjudication.truth = { is_absent: true, value: 1000, unit: "INR_CRORE", pdf_page: 1 };
  let errs = validateGroundTruth(gt);
  assert.ok(errs.includes("i1: is_absent must be true iff value is null"));

  gt.items[0].adjudication.truth = { is_absent: false, value: 1000, unit: null, pdf_page: 1 };
  errs = validateGroundTruth(gt);
  assert.ok(errs.includes("i1: unit is required unless the item is absent"));

  gt.items[0].adjudication.truth = { is_absent: false, value: 1000, unit: "INR_CRORE", pdf_page: 99 };
  errs = validateGroundTruth(gt);
  assert.ok(errs.includes("i1: pdf_page outside 1..page_count"));
});

test("a 'resolved' item with no reason, and a scored item with only one annotation, are both caught", () => {
  const gt = validGt();
  gt.items[0].adjudication.status = "resolved";
  let errs = validateGroundTruth(gt);
  assert.ok(errs.includes("i1: resolved needs a reason"));

  gt.items[0].adjudication.reason = "second reviewer corrected the page";
  gt.items[0].adjudication.annotations = 1;
  errs = validateGroundTruth(gt);
  assert.ok(errs.includes("i1: scored item needs two annotations"));
});

test("item_class implications: nil_dash means value 0, absent means is_absent", () => {
  const gt = validGt();
  gt.items[0].item_class = "nil_dash";
  let errs = validateGroundTruth(gt);
  assert.ok(errs.includes("i1: nil_dash implies value 0"));

  gt.items[0].item_class = "absent";
  errs = validateGroundTruth(gt);
  assert.ok(errs.includes("i1: absent class implies is_absent"));
});

test("a company outside the given peer set is flagged when a peer set is passed", () => {
  const gt = validGt();
  assert.deepEqual(validateGroundTruth(gt, new Set(["ACME"])), []);
  assert.deepEqual(validateGroundTruth(gt, new Set(["OTHERCO"])), ["f1: company_id not in the peer set"]);
});
