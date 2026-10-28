-- One optional investigation column: rupee/percentage figures the AI narrative stated that
-- checkNarrativeGrounding (narrativeGrounding.ts) could not trace to the data the model was
-- actually given. NOT APPLIED: run it in the Supabase SQL editor (safe to run twice). The app
-- works before and after - an investigation generated before this check existed simply has none
-- to show, same as every other column added after the first release.
--   grounding_warnings  text[], not null default '{}' so the column can be added without
--                       rewriting existing rows; '{}' on an older investigation means the check
--                       never ran on it, not that it passed. Only the narrative route writes it,
--                       at generation time.

alter table sentinel_investigations add column if not exists grounding_warnings text[] not null default '{}';
