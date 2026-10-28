-- Three optional company columns for the automatic share-price refresh.
-- NOT APPLIED: run it in the Supabase SQL editor (safe to run twice). The app works before and after: the refresh
-- saves the price without these if they are missing, it just cannot remember the ticker or where the price came from.
--   ticker              NSE trading symbol (TCS, INFY)
--   bse_code            BSE scrip code (532540), for a company the NSE file does not list
--   market_price_source where the stored price came from ("NSE bhavcopy"), shown next to its date

alter table sentinel_workspaces add column if not exists ticker text;
alter table sentinel_workspaces add column if not exists bse_code text;
alter table sentinel_workspaces add column if not exists market_price_source text;
