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
