-- Earnings-call commentary: the statements an analyst's upload of a call transcript yielded, each with the exact quote it came from.
-- NOT APPLIED: run it in the Supabase SQL editor (safe to run twice). Nothing breaks before it is run: the Results brief's commentary
-- panel says it is not set up yet.
-- Only the extracted statements and their quotes are kept, never the transcript itself. Written and read only through the app's
-- server routes (service role); no policy is added, so with row-level security on the table is closed to direct browser access.

create table if not exists sentinel_transcripts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references sentinel_workspaces(id) on delete cascade,
  owner_id uuid not null,
  period_end_date date not null,
  source_label text,
  text_chars integer not null default 0,
  items jsonb not null default '[]'::jsonb,
  dropped_count integer not null default 0,
  dropped_reasons text[] not null default '{}',
  generation_usage jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, owner_id, period_end_date)
);
create index if not exists sentinel_transcripts_workspace_idx on sentinel_transcripts (workspace_id, owner_id, period_end_date);

alter table sentinel_transcripts enable row level security;
