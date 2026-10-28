// Sentinel - what an AI generation actually cost. The Anthropic API reports token usage on every
// response; this turns that into per-turn and total figures so a cost claim is a measurement, not a
// guess (the evaluation scorer's own header notes this app had no cost instrumentation).
//
// Prices are Anthropic's published first-party rates per million tokens at the time of writing
// (checked 2026-10-06) and WILL drift - the cost here is labelled an estimate wherever it is shown.
// Cache reads bill at 0.1x the input rate and 5-minute cache writes at 1.25x.

export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
};

export type TurnUsage = TokenUsage & { turn: string; model: string };

export type UsageSummary = {
  turns: TurnUsage[];
  total: TokenUsage;
  /** null when any turn ran on a model with no price on file - better blank than wrong. */
  estimated_cost_usd: number | null;
};

const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** The API's usage object (cache fields may be null or absent) as plain numbers. */
export function normaliseUsage(u: unknown): TokenUsage {
  const o = (u && typeof u === "object" ? u : {}) as Record<string, unknown>;
  return {
    input_tokens: n(o.input_tokens),
    output_tokens: n(o.output_tokens),
    cache_creation_input_tokens: n(o.cache_creation_input_tokens),
    cache_read_input_tokens: n(o.cache_read_input_tokens),
  };
}

export function turnCostUsd(model: string, u: TokenUsage): number | null {
  const price = PRICE_PER_MTOK[model];
  if (!price) return null;
  const input =
    u.input_tokens * price.input + u.cache_read_input_tokens * price.input * 0.1 + u.cache_creation_input_tokens * price.input * 1.25;
  return (input + u.output_tokens * price.output) / 1_000_000;
}

export function summariseUsage(turns: TurnUsage[]): UsageSummary {
  const total: TokenUsage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  let cost: number | null = 0;
  for (const t of turns) {
    total.input_tokens += t.input_tokens;
    total.output_tokens += t.output_tokens;
    total.cache_creation_input_tokens += t.cache_creation_input_tokens;
    total.cache_read_input_tokens += t.cache_read_input_tokens;
    const c = turnCostUsd(t.model, t);
    cost = cost == null || c == null ? null : cost + c;
  }
  return { turns, total, estimated_cost_usd: cost == null ? null : Math.round(cost * 1e6) / 1e6 };
}
