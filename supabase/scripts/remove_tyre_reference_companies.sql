-- Removes the five seeded tyre reference companies and everything attached to them, so the reference set can
-- be rebuilt with technology companies. RUN BY HAND in the Supabase SQL editor. This deletes data permanently:
-- take a backup first (Database > Backups, or `pg_dump`), and run step 1 on its own before step 2.
--
-- It only touches public reference companies with these exact names. Companies you created yourself are not
-- matched, whatever their sector.

-- STEP 1: preview. Check the five names and the row counts are what you expect, then continue.
select w.id, w.company_name, w.sector, w.is_public_reference,
       (select count(*) from sentinel_statements s where s.workspace_id = w.id) as statements
from sentinel_workspaces w
where w.is_public_reference = true
  and w.company_name in ('Apollo Tyres Ltd', 'Ceat Ltd', 'JK Tyre & Industries Ltd', 'Balkrishna Industries Ltd', 'MRF Ltd');

-- STEP 2: delete. All or nothing: if any statement errors (for example a column name that differs in your
-- schema), nothing is removed. Comment out a child table you do not have, or fix the column, and run again.
begin;

create temporary table doomed on commit drop as
  select id from sentinel_workspaces
  where is_public_reference = true
    and company_name in ('Apollo Tyres Ltd', 'Ceat Ltd', 'JK Tyre & Industries Ltd', 'Balkrishna Industries Ltd', 'MRF Ltd');

delete from sentinel_recommendations
  where investigation_id in (select id from sentinel_investigations where workspace_id in (select id from doomed));
delete from sentinel_investigations where workspace_id in (select id from doomed);
delete from sentinel_review_cycles where workspace_id in (select id from doomed);
delete from sentinel_statements where workspace_id in (select id from doomed);
delete from sentinel_workspaces where id in (select id from doomed);

-- Expect zero rows here before you commit.
select company_name from sentinel_workspaces
  where company_name in ('Apollo Tyres Ltd', 'Ceat Ltd', 'JK Tyre & Industries Ltd', 'Balkrishna Industries Ltd', 'MRF Ltd');

commit;  -- or `rollback;` if anything above looked wrong
