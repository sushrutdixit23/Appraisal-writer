// Earnings-call commentary: what code lets stand. The model proposes statements with quotes; these tests are about everything that happens after.

import test from "node:test";
import assert from "node:assert/strict";
import { compareCommentary, figuresIn, parseModelItems, quoteInTranscript, normaliseForQuote, toneOf, verifyItems, type CommentaryItem } from "../../app/sentinel/lib/transcript";

const TRANSCRIPT = `
Operator: Welcome to the Acme Services Q2 FY27 earnings call.
Priya Rao, CEO: We delivered revenue growth of 4.2% in constant currency this quarter, and we are guiding to growth of 3-5% for the full year.
We expect the EBITDA margin to stay in the range of 20 to 21 percent, although wage hikes in the third quarter will weigh on it.
Attrition fell to 12.5% on a trailing basis. Our deal pipeline is the strongest it has been in eight quarters;
we signed ${"₹"}9,000 crore of large deals in the half. Discretionary spending among our banking clients remains
weak and we do not see that changing before the second half of next year.
`;
const item = (over: Record<string, unknown> = {}) => ({
  topic: "outlook", kind: "guidance", direction: "positive", speaker: "Priya Rao",
  statement: "Management guides to 3-5% growth for the full year.",
  quote: "we are guiding to growth of 3-5% for the full year", ...over,
});

test("a quote counts when it appears whole, whatever the case, spacing, curly quotes or line breaks of the transcript", () => {
  const norm = normaliseForQuote(TRANSCRIPT);
  assert.ok(quoteInTranscript("We expect the EBITDA margin to stay in the range of 20 to 21 percent", norm));
  assert.ok(quoteInTranscript("the strongest it has been in eight quarters; we signed ₹9,000 crore", norm)); // the transcript wrapped this across two lines
  assert.ok(quoteInTranscript("do not see that changing—before the second half", normaliseForQuote(TRANSCRIPT.replace("changing before", "changing - before")))); // dashes of different lengths are the same
});

test("an ellipsis joins parts that must each appear, in order; a made-up or reordered quote does not count", () => {
  const norm = normaliseForQuote(TRANSCRIPT);
  assert.ok(quoteInTranscript("Attrition fell to 12.5% ... our deal pipeline is the strongest", norm));
  assert.ok(!quoteInTranscript("our deal pipeline is the strongest ... Attrition fell to 12.5%", norm)); // wrong order
  assert.ok(!quoteInTranscript("we are guiding to growth of 6-8% for the full year", norm));
  assert.ok(!quoteInTranscript("revenue ... will ... rise", norm)); // fragments too short to mean anything
});

test("figures are compared as numbers: 1,200 is 1200, 15-16% is 15 and 16, small single digits are ignored", () => {
  assert.deepEqual([...figuresIn("grew 1,200 crore or 4.2% and 15-16% later, in Q2, across 3 deals")].sort(), ["15", "16", "1200", "4.2"].sort());
  assert.deepEqual([...figuresIn("12.50 and 3.0")].sort(), ["12.5", "3"].sort());
});

test("a statement stands only if its quote is in the transcript and every figure in it is in the quote", () => {
  const { items, dropped } = verifyItems([
    item(),
    item({ statement: "Management guides to 6-8% growth.", quote: "we are guiding to growth of 3-5% for the full year" }), // figure not in the quote
    item({ statement: "Management is optimistic about the second half.", quote: "we expect a very strong second half of the year ahead" }), // quote invented
    item({ statement: "Attrition fell to 12.5%.", quote: "Attrition fell to 12.5% on a trailing basis", topic: "people", kind: "commentary", direction: "positive" }),
  ], TRANSCRIPT);
  assert.deepEqual(items.map((i) => i.statement), ["Management guides to 3-5% growth for the full year.", "Attrition fell to 12.5%."]);
  assert.deepEqual(dropped.map((d) => d.reason), ["the figure 6 is in the statement but not in its quote", "the quote does not appear in the transcript"]);
});

test("malformed items are dropped with a reason; an unknown topic, kind or direction is defaulted, not trusted; speakers are trimmed", () => {
  const { items, dropped } = verifyItems([
    null, "text", { statement: "short", quote: "we are guiding to growth of 3-5% for the full year" },
    item({ topic: "astrology", kind: "prophecy", direction: "sideways", speaker: "  " }),
  ], TRANSCRIPT);
  assert.equal(dropped.length, 3);
  assert.deepEqual([items[0].topic, items[0].kind, items[0].direction, items[0].speaker], ["other", "commentary", "neutral", null]);
});

test("at most 20 items are kept", () => {
  const many = Array.from({ length: 60 }, () => item());
  assert.equal(verifyItems(many, TRANSCRIPT).items.length, 20);
});

test("the model's reply is read from plain or fenced JSON; anything else is not a reply", () => {
  assert.equal(parseModelItems('{"items":[{"a":1}]}')?.length, 1);
  assert.equal(parseModelItems('Here you go:\n```json\n{"items":[]}\n```')?.length, 0);
  assert.equal(parseModelItems("I cannot help with that."), null);
  assert.equal(parseModelItems('{"items": "nope"}'), null);
  assert.equal(parseModelItems("{broken"), null);
});

const ci = (topic: CommentaryItem["topic"], direction: CommentaryItem["direction"], statement = "A statement about it."): CommentaryItem => ({ topic, kind: "commentary", direction, statement, quote: "q".repeat(20), speaker: null });

test("tone is positive minus negative statements", () => {
  assert.equal(toneOf([ci("demand", "positive"), ci("demand", "positive"), ci("demand", "negative")]), "positive");
  assert.equal(toneOf([ci("demand", "positive"), ci("demand", "negative")]), "neutral");
  assert.equal(toneOf([ci("demand", "negative")]), "negative");
});

test("this call against the last: tone shifts first, then new topics, then dropped ones, then unchanged; each with both quarters' statements", () => {
  const prev = [ci("demand", "positive"), ci("pricing", "neutral"), ci("people", "negative"), ci("margins", "positive")];
  const cur = [ci("demand", "negative"), ci("risks", "negative"), ci("people", "negative"), ci("margins", "positive")];
  const changes = compareCommentary(cur, prev);
  assert.deepEqual(changes.map((c) => [c.topic, c.status]), [["demand", "tone_shift"], ["risks", "new"], ["pricing", "dropped"], ["margins", "continued"], ["people", "continued"]]);
  const demand = changes[0];
  assert.deepEqual([demand.from, demand.to, demand.current.length, demand.previous.length], ["positive", "negative", 1, 1]);
  assert.equal(changes.find((c) => c.topic === "risks")!.previous.length, 0);
  assert.deepEqual(compareCommentary([], []), []);
  assert.ok(compareCommentary(cur, []).every((c) => c.status === "new")); // no previous call: everything is new, nothing is a shift
});

test("percent in words and ranges written with 'to' compare like the % sign: '4-6%' is covered by '4 to 6 percent'", () => {
  assert.deepEqual([...figuresIn("growth of 4 to 6 percent and 12.5 per cent")].sort(), ["12.5", "4", "6"]);
  const t = "We expect revenue growth of 4 to 6 percent in the second half, and we remain confident in our deal pipeline.";
  const { items, dropped } = verifyItems([{ topic: "outlook", kind: "guidance", direction: "positive", statement: "Management expects 4-6% growth in the second half.", quote: "We expect revenue growth of 4 to 6 percent in the second half" }], t);
  assert.equal(items.length, 1, JSON.stringify(dropped));
});
