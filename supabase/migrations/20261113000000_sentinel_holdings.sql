-- Holdings: what a person owns, so the digest and the Portfolio page can weight findings by position size ("this company is 8% of your book and its auditor filed a
-- fraud report"). One row per person and company; the company is a project the person can read (their own or a reference company). Private to the person: written and
-- read only through the app's server routes (service role); no policy is added, so with row-level security on the table is closed to direct browser access.
-- NOT APPLIED: run it in the Supabase SQL editor (safe to run twice). Nothing breaks before it is run: the Portfolio page says it is not set up yet.

create table if not exists sentinel_holdings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  workspace_id uuid not null references sentinel_workspaces(id) on delete cascade,
  quantity numeric not null check (quantity > 0),
  avg_cost numeric check (avg_cost is null or avg_cost >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, workspace_id)
);
create index if not exists sentinel_holdings_owner_idx on sentinel_holdings (owner_id);

alter table sentinel_holdings enable row level security;
