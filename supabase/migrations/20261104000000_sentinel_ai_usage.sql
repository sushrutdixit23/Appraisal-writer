-- One optional investigation column: the tokens and estimated cost of the model calls that produced a draft.
-- NOT APPLIED: run it in the Supabase SQL editor (safe to run twice). The app works before and after: the
-- narrative route saves the investigation without this column if the database does not have it yet.
--   generation_usage  jsonb { turns: [{ turn, model, input_tokens, output_tokens, cache_* }], total, estimated_cost_usd }
--                     written once, by the narrative route, at generation time. Prices behind the estimate are in
--                     app/sentinel/lib/aiUsage.ts and drift - treat the dollar figure as an estimate.

alter table sentinel_investigations add column if not exists generation_usage jsonb;
