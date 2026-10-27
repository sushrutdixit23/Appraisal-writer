-- Removes the five seeded tyre reference companies and everything attached to them, so the reference set can
-- be rebuilt with technology companies. RUN BY HAND in the Supabase SQL editor. This deletes data permanently:
-- take a backup first (Database > Backups, or `pg_dump`).
--
-- It only touches public reference companies with these exact names. Companies you created yourself are not
-- matched, whatever their sector.
--
-- Run STEP 1 on its own first, as its own query. Check the five names and the row counts are what you expect
-- before going anywhere near STEP 2.
--
-- STEP 2 names the five companies again in every statement (no temporary table, no cross-statement state),
-- so it runs correctly whether your SQL editor sends the whole block as one query or splits it into several -
-- the earlier version of this script used a temporary table, which only exists on the one database
-- connection that created it, and an editor that opens a new connection per statement would then fail with
-- "relation doomed does not exist", as happened when this was tried.

-- STEP 1: preview.
select w.id, w.company_name, w.sector, w.is_public_reference,
       (select count(*) from sentinel_statements s where s.workspace_id = w.id) as statements
from sentinel_workspaces w
where w.is_public_reference = true
  and w.company_name in ('Apollo Tyres Ltd', 'Ceat Ltd', 'JK Tyre & Industries Ltd', 'Balkrishna Industries Ltd', 'MRF Ltd');

-- STEP 2: delete. Run this whole block together, as one query (select it all, or run the file, rather than
-- line by line). If any statement errors - for example a column name that differs in your schema - nothing
-- after the error has run yet; fix it and run the whole block again from the top.
begin;

delete from sentinel_recommendations
  where investigation_id in (
    select i.id from sentinel_investigations i
    join sentinel_workspaces w on w.id = i.workspace_id
    where w.is_public_reference = true
      and w.company_name in ('Apollo Tyres Ltd', 'Ceat Ltd', 'JK Tyre & Industries Ltd', 'Balkrishna Industries Ltd', 'MRF Ltd')
  );

delete from sentinel_investigations
  where workspace_id in (
    select id from sentinel_workspaces
    where is_public_reference = true
      and company_name in ('Apollo Tyres Ltd', 'Ceat Ltd', 'JK Tyre & Industries Ltd', 'Balkrishna Industries Ltd', 'MRF Ltd')
  );

delete from sentinel_review_cycles
  where workspace_id in (
    select id from sentinel_workspaces
    where is_public_reference = true
      and company_name in ('Apollo Tyres Ltd', 'Ceat Ltd', 'JK Tyre & Industries Ltd', 'Balkrishna Industries Ltd', 'MRF Ltd')
  );

delete from sentinel_statements
  where workspace_id in (
    select id from sentinel_workspaces
    where is_public_reference = true
      and company_name in ('Apollo Tyres Ltd', 'Ceat Ltd', 'JK Tyre & Industries Ltd', 'Balkrishna Industries Ltd', 'MRF Ltd')
  );

delete from sentinel_workspaces
  where is_public_reference = true
    and company_name in ('Apollo Tyres Ltd', 'Ceat Ltd', 'JK Tyre & Industries Ltd', 'Balkrishna Industries Ltd', 'MRF Ltd');

-- Expect zero rows here before you commit.
select company_name from sentinel_workspaces
  where company_name in ('Apollo Tyres Ltd', 'Ceat Ltd', 'JK Tyre & Industries Ltd', 'Balkrishna Industries Ltd', 'MRF Ltd');

commit;  -- or `rollback;` if anything above looked wrong
