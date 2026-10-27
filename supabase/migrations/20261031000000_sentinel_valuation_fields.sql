-- Two optional statement lines for the Piotroski F-Score, peer valuation and the unbilled-revenue check.
-- NOT APPLIED: run it in the Supabase SQL editor (safe to run twice). The app works before and after: it
-- only sends these columns when they hold a value.
--   shares_outstanding  balance sheet: number of equity shares outstanding (a count, not a currency figure) -
--                       the Piotroski score's no-dilution check, and the share count a market price is
--                       divided by for market cap, P/E and EV multiples.
--   unbilled_revenue    balance sheet: unbilled revenue / contract assets, tracked apart from trade
--                       receivables so its growth can be compared with revenue's own growth.

alter table sentinel_statements add column if not exists shares_outstanding numeric;
alter table sentinel_statements add column if not exists unbilled_revenue numeric;
