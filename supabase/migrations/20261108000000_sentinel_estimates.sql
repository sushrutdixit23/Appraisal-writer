-- Estimates: what the analyst (or the street) expected a company to report, so results day can say beat or miss by line.
-- NOT APPLIED: run it in the Supabase SQL editor (safe to run twice). Nothing breaks before it is run: the Results brief
-- shows no estimates and the estimates panel says it is not set up yet.
-- Values are always stored in rupees CRORE, whatever unit the company reports in, so changing a project's unit never
-- leaves an estimate ten times out. Written and read only through the app's server routes (service role); no policy is
-- added, so with row-level security on the table is closed to direct browser access.

create table if not exists sentinel_estimates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references sentinel_workspaces(id) on delete cascade,
  owner_id uuid not null,
  period_end_date date not null,
  metric text not null check (metric in ('revenue', 'ebitda', 'pbt', 'pat')),
  source text not null check (source in ('consensus', 'own')),
  source_label text,
  value_cr numeric not null,
  as_of date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, owner_id, period_end_date, metric, source)
);
create index if not exists sentinel_estimates_workspace_idx on sentinel_estimates (workspace_id, owner_id, period_end_date);

alter table sentinel_estimates enable row level security;
