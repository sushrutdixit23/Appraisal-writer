-- Source and change history for statements. NOT APPLIED: run it in the Supabase SQL editor (it is safe to run
-- twice). Until it is applied the app keeps working and simply records nothing.
--
-- Two tables:
--   sentinel_field_sources     where each saved figure came from (typed, rules, AI or derived), with the page and
--                              quote when there is one, and who confirmed it.
--   sentinel_statement_changes one row per create, edit or delete of a statement, with the old and new value of
--                              every field that changed, who did it, and when. Deleted statements keep their
--                              full row here, so a deletion can be undone by hand.
--
-- Writes made through the app's server routes are recorded by the routes themselves (the service-role key has no
-- person attached). Writes made straight from a signed-in browser (the Manage Periods page today) are recorded by
-- the trigger below, which only fires when auth.uid() is set, so nothing is recorded twice.

create table if not exists sentinel_statement_changes (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  statement_id  uuid,
  period_label  text,
  basis         text,
  action        text not null check (action in ('created', 'updated', 'deleted')),
  changed_by    uuid,
  changed_at    timestamptz not null default now(),
  via           text not null check (via in ('api', 'browser')),
  changes       jsonb not null default '{}'::jsonb
);
create index if not exists sentinel_statement_changes_workspace_idx
  on sentinel_statement_changes (workspace_id, changed_at desc);

create table if not exists sentinel_field_sources (
  statement_id  uuid not null,
  workspace_id  uuid not null,
  field         text not null,
  kind          text not null check (kind in ('typed', 'rules', 'ai', 'derived')),
  detail        text,
  confirmed_by  uuid,
  confirmed_at  timestamptz,
  recorded_at   timestamptz not null default now(),
  primary key (statement_id, field)
);
create index if not exists sentinel_field_sources_workspace_idx on sentinel_field_sources (workspace_id);

alter table sentinel_statement_changes enable row level security;
alter table sentinel_field_sources enable row level security;

-- Only the company's owner can read its history. Nobody writes from the browser: the trigger and the server do.
drop policy if exists sentinel_statement_changes_read on sentinel_statement_changes;
create policy sentinel_statement_changes_read on sentinel_statement_changes for select to authenticated
  using (exists (select 1 from sentinel_workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));
drop policy if exists sentinel_field_sources_read on sentinel_field_sources;
create policy sentinel_field_sources_read on sentinel_field_sources for select to authenticated
  using (exists (select 1 from sentinel_workspaces w where w.id = workspace_id and (w.owner_id = auth.uid() or w.is_public_reference = true)));

create or replace function sentinel_audit_statement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  diff jsonb;
  skip text[] := array['id', 'workspace_id', 'created_at', 'updated_at'];
begin
  if auth.uid() is null then
    return coalesce(new, old); -- a server-route write: the route records it with the person's id
  end if;

  if tg_op = 'INSERT' then
    insert into sentinel_statement_changes (workspace_id, statement_id, period_label, basis, action, changed_by, via, changes)
    values (new.workspace_id, new.id, new.period_label, new.basis, 'created', auth.uid(), 'browser', '{}'::jsonb);
    return new;
  elsif tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('old', o.value, 'new', n.value)), '{}'::jsonb)
      into diff
      from jsonb_each(to_jsonb(old)) o
      join jsonb_each(to_jsonb(new)) n using (key)
      where o.value is distinct from n.value and n.key <> all (skip);
    if diff <> '{}'::jsonb then
      insert into sentinel_statement_changes (workspace_id, statement_id, period_label, basis, action, changed_by, via, changes)
      values (new.workspace_id, new.id, new.period_label, new.basis, 'updated', auth.uid(), 'browser', diff);
    end if;
    return new;
  else
    insert into sentinel_statement_changes (workspace_id, statement_id, period_label, basis, action, changed_by, via, changes)
    values (old.workspace_id, old.id, old.period_label, old.basis, 'deleted', auth.uid(), 'browser', jsonb_build_object('deleted_row', to_jsonb(old)));
    return old;
  end if;
end $$;

drop trigger if exists sentinel_statements_audit on sentinel_statements;
create trigger sentinel_statements_audit after insert or update or delete on sentinel_statements
  for each row execute function sentinel_audit_statement();
