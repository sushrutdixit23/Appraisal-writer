// The draft earnings note: built from the Acme quarter worked out by hand in quarterly.test.ts (Q2 FY27 revenue 1,100 against 1,050 and 1,000, EBITDA
// 220, PAT 150). The note states only what the brief, the estimates and the verified transcript statements say, and carries no rating.

import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { NOTE_BANNER, buildEarningsNote, type NoteBlock } from "../../app/sentinel/lib/earningsNote";
import { renderEarningsNoteDocx } from "../../app/sentinel/lib/earningsNoteDocx";
import { buildResultsBrief } from "../../app/sentinel/lib/quarterly";
import type { CommentaryItem } from "../../app/sentinel/lib/transcript";
import type { EstimateRow } from "../../app/sentinel/lib/estimates";
import { st, ws } from "./helpers";
import type { FinancialStatement } from "../../app/sentinel/lib/types";

const q = (type: "Q1" | "Q2" | "Q3" | "Q4", label: string, end: string, over: Partial<FinancialStatement> = {}) => st("acme", { period_type: type, period_label: label, period_end_date: end, ...over });
const statements = [
  q("Q2", "Q2 FY27", "2026-09-30", { revenue_from_operations: 1100, ebitda: 220, other_income: 20, profit_before_tax: 200, tax_expense: 50, profit_after_tax: 150 }),
  q("Q1", "Q1 FY27", "2026-06-30", { revenue_from_operations: 1050, ebitda: 215.25, other_income: 18, profit_before_tax: 195, tax_expense: 49, profit_after_tax: 146 }),
  q("Q4", "Q4 FY26", "2026-03-31", { revenue_from_operations: 1020, ebitda: 204, profit_before_tax: 185, profit_after_tax: 140 }),
  q("Q3", "Q3 FY26", "2025-12-31", { revenue_from_operations: 1010, ebitda: 202, profit_before_tax: 182, profit_after_tax: 137 }),
  q("Q2", "Q2 FY26", "2025-09-30", { revenue_from_operations: 1000, ebitda: 200, other_income: 15, profit_before_tax: 180, tax_expense: 45, profit_after_tax: 135 }),
];
const company = ws("acme", { sector: "technology", company_name: "Acme Systems" });
const brief = () => buildResultsBrief([company], statements, "acme")!;
const base = { today: "2026-10-28", estimates: [] as EstimateRow[], commentary: { current: null, previous: null, previous_label: null } };
const sec = (n: ReturnType<typeof buildEarningsNote>, heading: string) => n.sections.find((s) => s.heading === heading);
const text = (blocks: NoteBlock[]) => blocks.map((b) => (b.kind === "paragraph" ? b.text : b.kind === "bullets" ? b.items.join("\n") : b.table.rows.map((r) => r.join(" | ")).join("\n"))).join("\n");
const item = (over: Partial<CommentaryItem>): CommentaryItem => ({ topic: "outlook", kind: "guidance", direction: "positive", statement: "Management guides to 3-5% growth.", quote: "we are guiding to growth of 3-5%", speaker: "Priya Rao", ...over });

test("the summary states the quarter's own figures: revenue 1,100 (+10.0% on the year, +4.8% on the quarter), margin 20.0% (level on the year, -50 bps on the quarter), PAT 150", () => {
  const n = buildEarningsNote({ ...base, brief: brief() });
  assert.equal(n.title, "Acme Systems: Q2 FY27 results");
  assert.equal(n.banner, NOTE_BANNER);
  assert.equal(
    text(sec(n, "Summary")!.blocks),
    "Acme Systems reported revenue from operations of ₹1,100 cr in Q2 FY27, +10.0% on the same quarter last year and +4.8% on the previous quarter. " +
      "EBITDA margin was 20.0%, unchanged on the year and -50 bps on the quarter. Profit after tax was ₹150 cr, +11.1% on the year and +2.7% on the quarter."
  );
});

test("the quarter table carries every line with the quarter, the previous quarter, last year and the two changes", () => {
  const t = sec(buildEarningsNote({ ...base, brief: brief() }), "The quarter")!.blocks[0];
  assert.equal(t.kind, "table");
  if (t.kind !== "table") return;
  assert.deepEqual(t.table.head, ["₹ crore", "Q2 FY27", "Q1 FY27", "QoQ", "Q2 FY26", "YoY"]);
  assert.deepEqual(t.table.rows[0], ["Revenue from operations", "1,100", "1,050", "+4.8%", "1,000", "+10.0%"]);
  assert.deepEqual(t.table.rows[2], ["EBITDA margin", "20.0%", "20.5%", "-50 bps", "20.0%", "0 bps"]);
});

test("estimates appear only when entered, with the variance and the call worked out in code: 1,100 against 1,080 is +1.9%, a beat", () => {
  assert.equal(sec(buildEarningsNote({ ...base, brief: brief() }), "Against estimates"), undefined);
  const estimates: EstimateRow[] = [
    { period_end_date: "2026-09-30", metric: "revenue", source: "consensus", source_label: "Bloomberg", value_cr: 1080 },
    { period_end_date: "2026-09-30", metric: "pat", source: "own", value_cr: 160 },
    { period_end_date: "2026-06-30", metric: "revenue", source: "consensus", value_cr: 5 }, // another quarter: never shown
  ];
  const s = text(sec(buildEarningsNote({ ...base, brief: brief(), estimates }), "Against estimates")!.blocks);
  assert.match(s, /Revenue from operations ₹1,100 cr against consensus \(Bloomberg\) ₹1,080 cr: \+1\.9%, beat\./);
  assert.match(s, /Profit after tax ₹150 cr against own estimate ₹160 cr: -6\.3%, miss\./);
  assert.doesNotMatch(s, /₹5 cr/);
  assert.match(s, /no consensus feed/);
});

test("questions for management come only from the flags the brief raised, each once, in fixed wording", () => {
  const b = brief();
  b.flags = [{ id: "tax_rate", severity: 2, title: "Effective tax rate 9.0% is outside 15-35%", detail: "x" }, { id: "tax_rate", severity: 1, title: "dup", detail: "y" }];
  const n = buildEarningsNote({ ...base, brief: b });
  const questions = (sec(n, "Questions for management")!.blocks[0] as { items: string[] }).items;
  assert.equal(questions.length, 1);
  assert.match(questions[0], /effective tax rate/);
  b.flags = [];
  const none = buildEarningsNote({ ...base, brief: b });
  assert.equal(sec(none, "Questions for management"), undefined);
  assert.equal(sec(none, "What stands out"), undefined);
});

test("management commentary lists the verified statements with their quotes, and what changed since the last call; absent when there is no transcript", () => {
  assert.equal(sec(buildEarningsNote({ ...base, brief: brief() }), "What management said"), undefined);
  const n = buildEarningsNote({
    ...base, brief: brief(),
    commentary: {
      current: [item({}), item({ topic: "demand", kind: "risk", direction: "negative", statement: "Bank spending is weak.", quote: "spending remains weak", speaker: null })],
      previous: [item({ topic: "outlook", direction: "negative", statement: "Cautious.", quote: "we are cautious" })],
      previous_label: "Q1 FY27",
    },
  });
  const s = text(sec(n, "What management said")!.blocks);
  assert.match(s, /Outlook and guidance: tone moved from negative to positive since Q1 FY27\./);
  assert.match(s, /Demand and volumes: raised on this call, not on Q1 FY27\./);
  assert.match(s, /Management guides to 3-5% growth\. "we are guiding to growth of 3-5%" - Priya Rao/);
  assert.match(s, /listed, not endorsed/);
});

test("with no comparison on file the sentence is shorter rather than hedged, and the limits section says why", () => {
  const only = buildResultsBrief([company], [statements[0]], "acme")!;
  const n = buildEarningsNote({ ...base, brief: only });
  const s = text(sec(n, "Summary")!.blocks);
  assert.equal(s, "Acme Systems reported revenue from operations of ₹1,100 cr in Q2 FY27. EBITDA margin was 20.0%. Profit after tax was ₹150 cr.");
  assert.match(text(sec(n, "Basis and limits")!.blocks), /previous quarter .* is not on file/);
});

test("the note never recommends: no rating, target or buy / sell wording anywhere, and it says so", () => {
  const b = brief();
  const n = buildEarningsNote({ ...base, brief: b, commentary: { current: [item({})], previous: null, previous_label: null } });
  const all = n.sections.map((s) => text(s.blocks)).join("\n").replace(/This note gives no rating, target price or recommendation\./, "");
  assert.doesNotMatch(all, /\b(buy|sell|hold|overweight|underweight|outperform|target price|recommend)/i);
  assert.match(text(sec(n, "Basis and limits")!.blocks), /gives no rating, target price or recommendation/);
});

test("the Word file is a real .docx holding the title, the banner, the table and the sections", async () => {
  const estimates: EstimateRow[] = [{ period_end_date: "2026-09-30", metric: "revenue", source: "consensus", value_cr: 1080 }];
  const bytes = await renderEarningsNoteDocx(buildEarningsNote({ ...base, brief: brief(), estimates }));
  assert.equal(bytes.subarray(0, 2).toString(), "PK"); // a zip container
  const zip = await JSZip.loadAsync(bytes);
  assert.ok(zip.file("[Content_Types].xml") && zip.file("word/document.xml"));
  const xml = await zip.file("word/document.xml")!.async("string");
  for (const needle of ["Acme Systems: Q2 FY27 results", "DRAFT for analyst review", "Summary", "The quarter", "Against estimates", "Basis and limits", "Revenue from operations", "1,100", "₹1,080 cr"]) {
    assert.ok(xml.includes(needle), `missing in document.xml: ${needle}`);
  }
  assert.ok(xml.includes("<w:tbl>"), "the quarter table is a real Word table");
});
