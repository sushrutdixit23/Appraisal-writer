-- Operating measures that are not in the financial statements (attrition, utilisation, headcount, order book...),
-- one row per company, period and metric. NOT APPLIED: run it in the Supabase SQL editor (safe to run twice).
-- Metric keys come from a shared list in the app (app/sentinel/lib/metrics.ts) so peers can be compared; a company
-- can also record a custom one. `source` says where the figure was read (for example "Q3 FY26 investor deck, p.12").

create table if not exists sentinel_operating_metrics (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  period_label  text not null,
  metric        text not null,
  value         numeric not null,
  unit          text,
  source        text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, period_label, metric)
);
create index if not exists sentinel_operating_metrics_workspace_idx on sentinel_operating_metrics (workspace_id, period_label);

alter table sentinel_operating_metrics enable row level security;

drop policy if exists sentinel_operating_metrics_read on sentinel_operating_metrics;
create policy sentinel_operating_metrics_read on sentinel_operating_metrics for select to authenticated
  using (exists (select 1 from sentinel_workspaces w where w.id = workspace_id and (w.owner_id = auth.uid() or w.is_public_reference = true)));
drop policy if exists sentinel_operating_metrics_write on sentinel_operating_metrics;
create policy sentinel_operating_metrics_write on sentinel_operating_metrics for all to authenticated
  using (exists (select 1 from sentinel_workspaces w where w.id = workspace_id and w.owner_id = auth.uid()))
  with check (exists (select 1 from sentinel_workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));
