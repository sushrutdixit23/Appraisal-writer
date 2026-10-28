// Sentinel - narrative grounding. The investigation narrative is free-form prose from Claude; the
// system prompt tells it "never state a figure you can't derive from the data you were given", but
// that is an instruction, not a guarantee. This checks the model's OWN output after the fact: every
// rupee or percentage figure it states must either (a) appear in the data it was actually handed, or
// (b) be the correct result of a simple calculation combining two numbers it was handed - the exact
// "input x input = result" style the system prompt itself asks for (e.g. "Revenue cr22.7cr x
// (15% - 7.9%) = cr1.6cr"). Anything else is a figure with no traceable source.
//
// Deliberately narrow in scope: it only looks at numbers written with a rupee sign, a percent
// sign, or a count of days ("94 days" - receivable and inventory days are exactly the figure a
// working-capital narrative leans on), since those are the tokens that read as a financial claim
// rather than a flag count, a year, or a footnote marker. Narrow on purpose - a false positive on a genuinely odd but correct
// number costs a reviewer one extra glance; staying silent on an invented one costs a decision
// made on a number nobody can trace. Never blocks a save: these are warnings for the reviewer
// screen, the same "show your work, flag what you can't verify" posture as checkAndDowngrade in
// autofill/derive.ts and the per-field grounding check in extraction.ts - this is that same idea
// applied to prose instead of a structured field.

const RUPEE_NUMBER = /₹\s*(-?[\d,]+(?:\.\d+)?)/g;
const PERCENT_NUMBER = /(-?[\d,]+(?:\.\d+)?)\s*%/g;

const DAYS_NUMBER = /(-?\d[\d,]*(?:\.\d+)?)[\s-]*days?\b/gi;
const ANY_NUMBER = /-?\d[\d,]*(?:\.\d+)?/g;

type Claim = { raw: string; value: number };

/** Every rupee or percentage figure written in `text`, deduplicated by its exact printed form. */
function parseClaims(text: string): Claim[] {
  const claims: Claim[] = [];
  for (const re of [RUPEE_NUMBER, PERCENT_NUMBER]) {
    for (const m of text.matchAll(re)) {
      const v = Number(m[1].replace(/,/g, ""));
      if (Number.isFinite(v)) claims.push({ raw: m[0].trim(), value: v });
    }
  }
  return claims;
}

/** Equal for grounding purposes: within rounding of a formatted figure (1 dp for a percentage,
 * 2 sig. figs of relative error for a rupee amount), never an exact-float comparison. */
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 0.01);

/** Every pairwise sum and difference of the pool - a "7.3 percentage-point gap" between two
 * grounded percentages (15.2% - 7.9%) is exactly this, one step removed from the raw figures. */
function pairwiseSumsAndDifferences(pool: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = 0; j < pool.length; j++) {
      if (i === j) continue;
      out.push(pool[i] + pool[j], pool[i] - pool[j]);
    }
  }
  return out;
}

/** Is `value` one of the given numbers, a pairwise sum/difference of two of them (a
 * percentage-point gap), or a product/ratio combining one of them with such a sum or difference
 * (the "input x (input - input) = result" style the narrative prompt itself asks the model to
 * show, e.g. "Revenue cr22.7cr x (15.2% - 7.9%) = cr1.66cr")? Checking every such pair against a
 * prompt's own (bounded) number set is cheap and exact about what counts as derivable, rather
 * than trying to parse the model's arithmetic expression itself. */
function derivable(value: number, pool: number[]): boolean {
  if (pool.length === 0) return false;
  if (pool.some((a) => close(value, a) || close(value, -a))) return true;
  const oneStep = pairwiseSumsAndDifferences(pool.slice(0, 120)); // bounded: a prompt's own figures, not user input
  if (oneStep.some((a) => close(value, a))) return true;
  const combined = [...pool, ...oneStep];
  for (const a of pool) {
    for (const b of combined) {
      if (close(value, (a / 100) * b) || close(value, (b / 100) * a)) return true;
      if (b !== 0 && close(value, (a / b) * 100)) return true;
      if (a !== 0 && close(value, (b / a) * 100)) return true;
    }
  }
  return false;
}

/** Figures in `narrative` that cannot be traced to `groundedText` (what the model was actually
 * given, verbatim - the user-turn prompt text, not the model's own prior turns). Returns the
 * figure as printed ("+15.2%", "cr1.6cr"), so a reviewer can find it in the text; empty when
 * everything checks out. Pure and synchronous - no model call, same as every other check in
 * this codebase that decides whether to trust a figure. */
/** A day count is grounded when it is a number the prompt carried (the flag text, the trend line, a peer's days) or the
 * gap between two of them ("28 days longer than last year"). Only day-sized numbers count, so a rupee amount in the
 * thousands cannot accidentally vouch for an invented "120 days". */
function daysGrounded(value: number, groundedText: string): boolean {
  // Rupee amounts and fiscal-year labels ("FY25") are numbers too, but not day counts.
  const stripped = groundedText.replace(/\u20b9\s*-?[\d,]+(?:\.\d+)?(?:\s*(?:cr|crore|lakh|million))?/gi, " ").replace(/\bFY\d{2,4}\b/gi, " ");
  const pool = [...stripped.matchAll(ANY_NUMBER)].map((m) => Number(m[0].replace(/,/g, ""))).filter((n) => Number.isFinite(n) && Math.abs(n) <= 1000).slice(0, 200);
  // Narratives round days to whole numbers, so half a day of slack either way.
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.5, Math.abs(b) * 0.01);
  if (pool.some((a) => near(value, a))) return true;
  for (const a of pool) for (const b of pool) if (a !== b && near(value, Math.abs(a - b))) return true;
  return false;
}

export function checkNarrativeGrounding(narrative: string, groundedText: string): string[] {
  const pool = parseClaims(groundedText).map((c) => c.value);
  const seen = new Set<string>();
  const ungrounded: string[] = [];
  for (const claim of parseClaims(narrative)) {
    if (seen.has(claim.raw)) continue;
    seen.add(claim.raw);
    if (!derivable(claim.value, pool)) ungrounded.push(claim.raw);
  }
  for (const m of narrative.matchAll(DAYS_NUMBER)) {
    const raw = m[0].trim();
    if (seen.has(raw)) continue;
    seen.add(raw);
    const v = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(v) && !daysGrounded(v, groundedText)) ungrounded.push(raw);
  }
  return ungrounded;
}
