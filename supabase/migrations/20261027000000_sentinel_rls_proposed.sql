-- PROPOSED, NOT APPLIED. Row-level security for the Sentinel tables, written from the rules the app enforces
-- (app/sentinel/lib/access.ts): an owner reads and writes their companies; the public reference companies are
-- readable by anyone signed in and writable by no one; nobody sees anyone else's company.
--
-- The server routes use the service-role key, which bypasses RLS, so these policies are the guard for the
-- browser (anon key + the person's session) and a second line of defence behind the routes' own checks.
--
-- Review before applying: the live schema is not in this repo. sentinel_workspaces.owner_id and
-- is_public_reference, and sentinel_statements.workspace_id, are certain (the app reads them). The three child
-- tables below are assumed to carry workspace_id; confirm that in Supabase first. Run on a copy of the
-- database, then check with two real accounts that A cannot read B's company and that a reference company
-- cannot be edited from the browser.

alter table sentinel_workspaces enable row level security;
alter table sentinel_statements enable row level security;
alter table sentinel_investigations enable row level security;
alter table sentinel_recommendations enable row level security;
alter table sentinel_review_cycles enable row level security;

-- Companies
drop policy if exists sentinel_workspaces_read on sentinel_workspaces;
create policy sentinel_workspaces_read on sentinel_workspaces for select to authenticated
  using (owner_id = auth.uid() or is_public_reference = true);
drop policy if exists sentinel_workspaces_insert on sentinel_workspaces;
create policy sentinel_workspaces_insert on sentinel_workspaces for insert to authenticated
  with check (owner_id = auth.uid() and coalesce(is_public_reference, false) = false);
drop policy if exists sentinel_workspaces_update on sentinel_workspaces;
create policy sentinel_workspaces_update on sentinel_workspaces for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and coalesce(is_public_reference, false) = false);
drop policy if exists sentinel_workspaces_delete on sentinel_workspaces;
create policy sentinel_workspaces_delete on sentinel_workspaces for delete to authenticated
  using (owner_id = auth.uid());

-- Statements: readable when the company is readable; writable only by the company's owner.
drop policy if exists sentinel_statements_read on sentinel_statements;
create policy sentinel_statements_read on sentinel_statements for select to authenticated
  using (exists (select 1 from sentinel_workspaces w where w.id = workspace_id and (w.owner_id = auth.uid() or w.is_public_reference = true)));
drop policy if exists sentinel_statements_write on sentinel_statements;
create policy sentinel_statements_write on sentinel_statements for all to authenticated
  using (exists (select 1 from sentinel_workspaces w where w.id = workspace_id and w.owner_id = auth.uid()))
  with check (exists (select 1 from sentinel_workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));

-- Investigations, recommendations, review cycles: the owner's company only.
do $$
declare t text;
begin
  foreach t in array array['sentinel_investigations', 'sentinel_recommendations', 'sentinel_review_cycles'] loop
    execute format('drop policy if exists %I on %I', t || '_owner', t);
    execute format(
      'create policy %I on %I for all to authenticated
         using (exists (select 1 from sentinel_workspaces w where w.id = workspace_id and w.owner_id = auth.uid()))
         with check (exists (select 1 from sentinel_workspaces w where w.id = workspace_id and w.owner_id = auth.uid()))',
      t || '_owner', t);
  end loop;
end $$;
