-- Market data for peer valuation (EV/EBITDA, P/E, EV/Sales, market cap). NOT APPLIED: run it in the Supabase
-- SQL editor (safe to run twice). The app works before and after: it only sends these columns when they hold
-- a value, and every valuation figure is simply blank until a price is entered.
--   market_price         a person's own entry of the current share price - Sentinel has no live market feed
--   market_price_as_of   the date that price was entered/true as of, so a stale price is visible, not assumed current

alter table sentinel_workspaces add column if not exists market_price numeric;
alter table sentinel_workspaces add column if not exists market_price_as_of date;
