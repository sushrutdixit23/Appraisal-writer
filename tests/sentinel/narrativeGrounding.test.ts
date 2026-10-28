// checkNarrativeGrounding: every rupee/% figure the narrative states must trace to the data it was
// given, directly or as a simple combination of two numbers from it - never to a model's say-so.

import test from "node:test";
import assert from "node:assert/strict";
import { checkNarrativeGrounding } from "../../app/sentinel/lib/narrativeGrounding";

const grounded = "Revenue: ₹22.7cr. Prior year revenue ₹20.3cr. yoy_revenue_growth:\n  Alpha: +15.2% <- flagged company\n  Beta: +7.9%";

test("a figure printed verbatim in the grounded text is not flagged", () => {
  assert.deepEqual(checkNarrativeGrounding("Revenue grew to ₹22.7cr, up from ₹20.3cr.", grounded), []);
});

test("a figure nowhere in the grounded text, and not derivable from it, is flagged", () => {
  const flagged = checkNarrativeGrounding("Margins fell to 42.0%, a historic low.", grounded);
  assert.deepEqual(flagged, ["42.0%"]);
});

test("the exact inline calculation style the narrative prompt asks for is accepted", () => {
  // 22.7 x (15.2% - 7.9%) = 1.6577 ~ 1.66cr - the kind of worked figure the system prompt invites.
  assert.deepEqual(
    checkNarrativeGrounding("Revenue ₹22.7cr x (15.2% - 7.9%) = ₹1.66cr of the gap is scale.", grounded),
    []
  );
});

test("a percentage-point gap between two grounded percentages is accepted", () => {
  // 15.2% - 7.9% = 7.3 percentage points.
  assert.deepEqual(checkNarrativeGrounding("That is a 7.3pp gap to the peer average.", grounded), []);
});

test("a negated grounded figure (a loss stated as negative) is not flagged", () => {
  assert.deepEqual(checkNarrativeGrounding("This represents ₹-22.7cr of exposure.", "Impact: ₹22.7cr"), []);
});

test("no claims in the narrative is a clean pass, not an error", () => {
  assert.deepEqual(checkNarrativeGrounding("This looks company-specific, not a sector-wide effect.", grounded), []);
});

test("the same ungrounded figure repeated is only reported once", () => {
  assert.deepEqual(checkNarrativeGrounding("It fell to 42.0%. Later, still 42.0%.", grounded), ["42.0%"]);
});

const wc = "receivable days of 110 exceed the configured 90-day threshold\n  receivable_days: 81.11 in FY25 -> 109.50 in FY26\n  Wipro (consolidated): 85.00";

test("day counts: a figure the prompt carried, or the gap between two of them, is grounded; an invented one is flagged", () => {
  assert.deepEqual(checkNarrativeGrounding("Collections now take 109.5 days, up from 81 days.", wc), []);
  assert.deepEqual(checkNarrativeGrounding("That is 28 days longer than last year.", wc), []); // 109.50 - 81.11 = 28.39
  assert.deepEqual(checkNarrativeGrounding("Peers collect in 62 days on average.", wc), ["62 days"]);
});

test("day counts: a rupee amount in the thousands cannot vouch for an invented day count", () => {
  assert.deepEqual(checkNarrativeGrounding("Receivables are about 365 days of sales.", "Revenue ₹365.0 cr"), ["365 days"]);
});

test("a percentage change between two day figures the prompt carried is grounded (88.17 to 94.46 days is +7.1%); an unrelated percentage is not", () => {
  const g = "receivable_days: 88.17 in FY25 -> 94.46 in FY26\nTCS: 94.46 days";
  assert.deepEqual(checkNarrativeGrounding("Receivable days rose about 7% over the year.", g), []);
  assert.deepEqual(checkNarrativeGrounding("Receivable days rose 23% over the year.", g), ["23%"]);
});
