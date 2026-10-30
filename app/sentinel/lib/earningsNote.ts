// Sentinel - the draft earnings note: a results-day write-up an analyst starts from, built entirely from what is on file.
// Every figure is a number from the results brief (a subtraction or ratio of imported lines), every estimate line comes from estimates the analyst entered,
// every quote is wording the transcript reader verified is in the call, and every question is a fixed template keyed to a flag the brief raised. Nothing
// here is a model's say-so, and the note carries no rating, target or recommendation: those are the analyst's to add. It is a DRAFT, and says so.
//
// This file builds a plain document model (sections of paragraphs, bullets and tables); earningsNoteDocx.ts renders it to a Word file.

import { buildVariance, type EstimateRow, type VarianceRow } from "./estimates";
import type { ResultsBrief, BriefLine } from "./quarterly";
import { TOPIC_LABEL, compareCommentary, type CommentaryItem } from "./transcript";

export type NoteTable = { head: string[]; rows: string[][]; /** Columns after the first are right-aligned figures. */ numeric: boolean };
export type NoteBlock =
  | { kind: "paragraph"; text: string; italic?: boolean }
  | { kind: "bullets"; items: string[] }
  | { kind: "table"; table: NoteTable };
export type NoteSection = { heading: string; blocks: NoteBlock[] };
export type EarningsNote = { title: string; subtitle: string; banner: string; sections: NoteSection[] };

export type NoteInput = {
  brief: ResultsBrief;
  estimates: EstimateRow[];
  /** What the call this quarter said, and the call before, as the transcript reader stored them. Either may be missing. */
  commentary: { current: CommentaryItem[] | null; previous: CommentaryItem[] | null; previous_label: string | null };
  /** YYYY-MM-DD. */
  today: string;
};

export const NOTE_BANNER = "DRAFT for analyst review. Generated from the figures on file in Sentinel; check each against the filing before it goes anywhere.";

const cr = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: Math.abs(v) < 100 ? 1 : 0 })} cr`;
const pct = (v: number, dp = 1) => `${(v * 100).toFixed(dp)}%`;
const signedPct = (v: number, dp = 1) => `${v >= 0 ? "+" : "-"}${Math.abs(v * 100).toFixed(dp)}%`;
const bps = (v: number) => (Math.round(v * 10_000) === 0 ? "0 bps" : `${v >= 0 ? "+" : "-"}${Math.abs(Math.round(v * 10_000))} bps`);
const marginMove = (v: number) => (Math.round(v * 10_000) === 0 ? "unchanged" : bps(v));
const amount = (v: number | null) => (v == null ? "-" : v.toLocaleString("en-IN", { maximumFractionDigits: Math.abs(v) < 100 ? 1 : 0 }));
const show = (l: BriefLine, v: number | null) => (v == null ? "-" : l.kind === "amount" ? amount(v) : pct(v));
const delta = (l: BriefLine, v: number | null) => (v == null ? "-" : l.kind === "amount" ? signedPct(v) : bps(v));
const line = (b: ResultsBrief, key: string) => b.lines.find((l) => l.key === key) ?? null;

/** One sentence per fact that exists; a fact with no comparison is left out rather than hedged. */
function headline(b: ResultsBrief): string {
  const rev = line(b, "revenue"), eb = line(b, "ebitda_margin"), pat = line(b, "pat");
  const parts: string[] = [];
  if (rev?.current != null) {
    const moves = [rev.yoy != null ? `${signedPct(rev.yoy)} on the same quarter last year` : null, rev.qoq != null ? `${signedPct(rev.qoq)} on the previous quarter` : null].filter(Boolean);
    parts.push(`${b.company_name} reported revenue from operations of ${cr(rev.current)} in ${b.period_label}${moves.length ? `, ${moves.join(" and ")}` : ""}.`);
  }
  if (eb?.current != null) parts.push(`EBITDA margin was ${pct(eb.current)}${eb.yoy != null ? `, ${marginMove(eb.yoy)} on the year` : ""}${eb.qoq != null ? `${eb.yoy != null ? " and" : ","} ${marginMove(eb.qoq)} on the quarter` : ""}.`);
  if (pat?.current != null) parts.push(`Profit after tax was ${cr(pat.current)}${pat.yoy != null ? `, ${signedPct(pat.yoy)} on the year` : ""}${pat.qoq != null ? ` and ${signedPct(pat.qoq)} on the quarter` : ""}.`);
  return parts.join(" ");
}

const METRIC_NAME: Record<string, string> = { revenue: "Revenue from operations", ebitda: "EBITDA", pbt: "Profit before tax", pat: "Profit after tax" };

function estimateBullets(v: VarianceRow[]): string[] {
  const out: string[] = [];
  for (const row of v) {
    for (const e of row.estimates) {
      const source = e.source === "consensus" ? "consensus" : "own estimate";
      const label = e.source_label ? ` (${e.source_label})` : "";
      if (row.actual == null || e.variance == null || e.call == null) { out.push(`${METRIC_NAME[row.metric]}: ${source}${label} ${cr(e.value)}; no actual to compare.`); continue; }
      out.push(`${METRIC_NAME[row.metric]} ${cr(row.actual)} against ${source}${label} ${cr(e.value)}: ${signedPct(e.variance)}, ${e.call}.`);
    }
  }
  return out;
}

/** The question an analyst would put to management for each kind of flag. Fixed wording, so it can never state a fact the numbers do not support. */
const QUESTIONS: Record<string, string> = {
  revenue_yoy: "What drove the change in revenue on last year: volume, price, mix or a one-off? How much of it is expected to repeat?",
  revenue_qoq: "What explains the move in revenue from the previous quarter: seasonality, order timing or a change in demand?",
  ebitda_margin_yoy: "What moved the EBITDA margin against last year: input costs, pricing, mix or operating leverage? Which part is structural?",
  ebitda_margin_qoq: "What moved the EBITDA margin from the previous quarter, and is that level the base for the next one?",
  exceptional: "What is the exceptional item, is it cash or non-cash, and does anything similar sit in next quarter?",
  other_income: "How much of profit came from other income, what is it made of, and is it recurring?",
  tax_rate: "Why was the effective tax rate outside the usual range, and what rate should be assumed going forward?",
  peer_margin: "Why is the EBITDA margin this far from peers that reported the same quarter: business mix, scale or accounting?",
  peer_growth: "Why is growth this far from the peers that reported the same quarter: share gain or loss, a different mix or timing?",
};

function commentarySection(input: NoteInput): NoteSection | null {
  const cur = input.commentary.current;
  if (!cur || cur.length === 0) return null;
  const blocks: NoteBlock[] = [{ kind: "paragraph", text: "Statements below are management's, each with words checked to appear in the call transcript. They are listed, not endorsed." }];
  const prev = input.commentary.previous;
  if (prev && prev.length > 0) {
    const changes = compareCommentary(cur, prev).filter((c) => c.status !== "continued");
    if (changes.length > 0) {
      const describe = (c: (typeof changes)[number]) => {
        const label = TOPIC_LABEL[c.topic];
        return c.status === "tone_shift" ? `${label}: tone moved from ${c.from} to ${c.to} since ${input.commentary.previous_label ?? "the previous call"}.`
          : c.status === "new" ? `${label}: raised on this call, not on ${input.commentary.previous_label ?? "the previous call"}.`
          : `${label}: discussed on ${input.commentary.previous_label ?? "the previous call"}, not on this one.`;
      };
      blocks.push({ kind: "bullets", items: changes.map(describe) });
    }
  }
  blocks.push({ kind: "bullets", items: cur.map((i) => `${TOPIC_LABEL[i.topic]} (${i.kind}, ${i.direction}): ${i.statement} "${i.quote}"${i.speaker ? ` - ${i.speaker}` : ""}`) });
  return { heading: "What management said", blocks };
}

export function buildEarningsNote(input: NoteInput): EarningsNote {
  const b = input.brief;
  const sections: NoteSection[] = [];

  sections.push({ heading: "Summary", blocks: [{ kind: "paragraph", text: headline(b) || `${b.company_name} ${b.period_label}: no comparable figures on file.` }] });

  sections.push({
    heading: "The quarter",
    blocks: [{
      kind: "table", table: {
        numeric: true,
        head: ["₹ crore", b.period_label, b.prior_quarter_label ?? "Previous quarter", "QoQ", b.prior_year_label ?? "Last year", "YoY"],
        rows: b.lines.map((l) => [l.label, show(l, l.current), show(l, l.prior_quarter), delta(l, l.qoq), show(l, l.prior_year), delta(l, l.yoy)]),
      },
    }],
  });

  const variance = buildVariance(b, input.estimates);
  const estimateItems = estimateBullets(variance);
  if (estimateItems.length > 0) {
    sections.push({ heading: "Against estimates", blocks: [{ kind: "bullets", items: estimateItems }, { kind: "paragraph", italic: true, text: "In line means within 1% on revenue, 2% on EBITDA and 3% on profit before and after tax (starting assumptions). Estimates are those entered in Sentinel; it has no consensus feed." }] });
  }

  if ("ttm" in b.ttm) {
    const t = b.ttm.ttm;
    sections.push({ heading: "Trailing twelve months", blocks: [{ kind: "paragraph", text: `Revenue ${cr(t.revenue)}${t.ebitda != null ? `, EBITDA ${cr(t.ebitda)}${t.ebitda_margin != null ? ` (${pct(t.ebitda_margin)} margin)` : ""}` : ""}, profit after tax ${cr(t.pat)}${t.pat_margin != null ? ` (${pct(t.pat_margin)} margin)` : ""}. ${t.basis === "financial year" ? `This is the audited ${t.labels[0]}.` : `The sum of ${t.labels.join(", ")}.`}` }] });
  }

  if (b.flags.length > 0) {
    sections.push({ heading: "What stands out", blocks: [{ kind: "bullets", items: b.flags.slice(0, 6).map((f) => `${f.title}. ${f.detail}`) }] });
  }

  const peerBlocks: NoteBlock[] = [];
  const { reported, not_reported, median } = b.peers;
  if (reported.length > 0) {
    const bits = [median.revenue_yoy != null ? `a median revenue growth of ${signedPct(median.revenue_yoy)} on the year` : null, median.ebitda_margin != null ? `a median EBITDA margin of ${pct(median.ebitda_margin)}` : null].filter(Boolean);
    peerBlocks.push({ kind: "paragraph", text: `${reported.length} peer${reported.length > 1 ? "s have" : " has"} reported this quarter${bits.length ? `, with ${bits.join(" and ")}` : ""}: ${reported.map((r) => r.company_name).join(", ")}.${not_reported.length ? ` Yet to report: ${not_reported.join(", ")}.` : ""}` });
  } else if (not_reported.length > 0) {
    peerBlocks.push({ kind: "paragraph", text: `No peer has reported this quarter yet: ${not_reported.join(", ")}.` });
  }
  if (peerBlocks.length > 0) sections.push({ heading: "Against peers", blocks: peerBlocks });

  const said = commentarySection(input);
  if (said) sections.push(said);

  const questions = [...new Set(b.flags.map((f) => QUESTIONS[f.id]).filter(Boolean))];
  if (questions.length > 0) sections.push({ heading: "Questions for management", blocks: [{ kind: "bullets", items: questions }] });

  const limits = [
    `Figures are ${b.basis} and in rupees crore, taken from the quarterly results imported into Sentinel. A quarterly result carries the profit and loss only; the balance sheet and cash flow come half-yearly.`,
    ...b.notes,
    "Flags use starting-assumption thresholds that are not calibrated against filings.",
    "This note gives no rating, target price or recommendation.",
  ];
  sections.push({ heading: "Basis and limits", blocks: [{ kind: "bullets", items: limits }] });

  return {
    title: `${b.company_name}: ${b.period_label} results`,
    subtitle: `Draft earnings note, quarter ended ${b.period_end_date}, prepared ${input.today}`,
    banner: NOTE_BANNER,
    sections,
  };
}
