// Sentinel — narrative formatting helpers. Small and presentation-only:
// the model is asked (see the narrative API route) to lead every
// response with one bolded verdict line (markdown **like this**),
// followed by a blank line, then the narrative body. This pulls that
// line out so the UI can render it as a real styled headline instead
// of dumping raw markdown asterisks on screen.

export function parseVerdict(text: string | null): { verdict: string | null; body: string } {
  if (!text) return { verdict: null, body: "" };
  // \s* (not \n+) deliberately - handles both the new explicit format
  // (verdict on its own line, blank line, then body) AND the older
  // inline style where the model continued the sentence right after
  // the bold span with no line break, e.g. "**RULES IT OUT** (as a
  // sector-wide effect) - this is company-specific..." Applies the
  // fix retroactively to narratives generated before the prompt change.
  const match = text.match(/^\*\*(.+?)\*\*\s*([\s\S]*)$/);
  if (match) {
    return { verdict: match[1].trim(), body: match[2].trim() };
  }
  // No leading bold line found (e.g. an investigation generated before
  // this format was introduced) - fall back to showing the whole thing
  // as body text. Never breaks on old data.
  return { verdict: null, body: text };
}
