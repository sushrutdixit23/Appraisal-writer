-- Data requests and the drafts they produce: the CA/finance-team half of ingestion.
-- NOT APPLIED: run it in the Supabase SQL editor (safe to run twice). Nothing in the app breaks before it is run;
-- the Import page's "Request data from the company's CA" panel just reports that it is not set up yet.
--   sentinel_data_requests  one row per "send me your numbers for period X". Only a SHA-256 of the upload token is
--                           stored; the plain token is shown once, at creation.
--   sentinel_ingest_drafts  what a submitted file was read as (an AutofillResult as jsonb), waiting for an analyst
--                           to review and import it. A draft is never written to the statements by itself.
-- Both tables are written and read only through the app's server routes (service role); no policy is added, so
-- with row-level security on they are closed to direct browser access.

create table if not exists sentinel_data_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references sentinel_workspaces(id) on delete cascade,
  owner_id uuid not null,
  token_hash text not null unique,
  period_end_date date not null,
  due_date date,
  cadence text check (cadence in ('monthly', 'quarterly', 'annual')),
  note text,
  status text not null default 'open' check (status in ('open', 'submitted', 'closed')),
  created_at timestamptz not null default now(),
  submitted_at timestamptz
);
create index if not exists sentinel_data_requests_workspace_idx on sentinel_data_requests (workspace_id, status);

create table if not exists sentinel_ingest_drafts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references sentinel_data_requests(id) on delete cascade,
  workspace_id uuid not null references sentinel_workspaces(id) on delete cascade,
  source_file text not null,
  result jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'imported', 'dismissed')),
  created_at timestamptz not null default now()
);
create index if not exists sentinel_ingest_drafts_workspace_idx on sentinel_ingest_drafts (workspace_id, status);

alter table sentinel_data_requests enable row level security;
alter table sentinel_ingest_drafts enable row level security;
