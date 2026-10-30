-- Covenants: a lender's limit on a ratio (net debt / EBITDA no higher than 3.0x, interest cover no lower than 2.5x), entered by the analyst, so the
-- tracker can say how much room the latest annual statement leaves and when the next test is.
-- NOT APPLIED: run it in the Supabase SQL editor (safe to run twice). Nothing breaks before it is run: the covenant page says it is not set up yet
-- and the digest simply lists no covenants.
-- Written and read only through the app's server routes (service role); no policy is added, so with row-level security on the table is closed to
-- direct browser access. Each row belongs to the person who entered it.

create table if not exists sentinel_covenants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references sentinel_workspaces(id) on delete cascade,
  owner_id uuid not null,
  name text not null,
  metric text not null check (metric in ('net_debt_ebitda', 'debt_equity', 'interest_cover', 'current_ratio')),
  comparator text not null check (comparator in ('max', 'min')),
  limit_value numeric not null check (limit_value > 0),
  next_test_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sentinel_covenants_workspace_idx on sentinel_covenants (workspace_id, owner_id);

alter table sentinel_covenants enable row level security;
