// Sentinel - scoring a finished narrative against the prompt that produced it. Pure and model-free, so it can grade a
// real model's output in an opt-in live run and a scripted good/bad output in the ordinary test suite. What each check
// demands depends on what the prompt actually handed the model: a narrative is only expected to name the basis when the
// prompt told it the peers differ, to use the trend when a trend block was given, and to hedge a receivables gap when
// the definition caveat was present. Grounding (every figure traceable) is demanded always.

import { checkNarrativeGrounding } from "./narrativeGrounding";
import { parseVerdict } from "./format";

export type EvalCheck = { id: string; ok: boolean; detail: string };
export type EvalScore = { passed: boolean; checks: EvalCheck[] };

const sentenceCount = (s: string) => (s.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [s]).length;

/** `prompt` is everything the model was shown (the user turns, verbatim). */
export function scoreNarrative(narrative: string, prompt: string): EvalScore {
  const { verdict, body } = parseVerdict(narrative);
  const checks: EvalCheck[] = [];
  const add = (id: string, ok: boolean, detail: string) => checks.push({ id, ok, detail });

  add("verdict", verdict != null && verdict.length > 0, verdict ? `verdict "${verdict}"` : "no bold verdict line at the start");
  const n = sentenceCount(body);
  add("length", n >= 2 && n <= 8, `${n} sentences in the body (asked for 3-5)`);

  const ungrounded = checkNarrativeGrounding(narrative, prompt);
  add("grounded", ungrounded.length === 0, ungrounded.length ? `figures not traceable to the prompt: ${ungrounded.join(", ")}` : "every figure traces to the prompt");

  if (/How the flagged measures moved from the prior year/.test(prompt)) {
    const used = /\b(FY\d{2}|prior[- ]year|last year|previous year|year[- ]on[- ]year|up from|down from|rose from|fell from|increased from|lengthened from)\b/i.test(body);
    add("uses_trend", used, used ? "refers to the prior year" : "the prompt gave a prior-year trend and the narrative never mentions it");
  }
  if (/peers are not all on the same basis/.test(prompt)) {
    const named = /\b(standalone|consolidated)\b/i.test(body);
    add("names_basis", named, named ? "names a basis" : "the peers are on mixed bases and the narrative never says which basis a figure is on");
  }
  if (/Receivable days may not be like-for-like/.test(prompt)) {
    const hedged = /\b(unbilled|definition|like-for-like|not comparable|comparab)/i.test(body);
    add("hedges_definition", hedged, hedged ? "mentions the definition issue" : "receivable days may be defined differently across peers and the narrative treats the gap as settled");
  }
  return { passed: checks.every((c) => c.ok), checks };
}
