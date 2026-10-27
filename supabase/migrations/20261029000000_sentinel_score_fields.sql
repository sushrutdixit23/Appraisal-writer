-- Three optional statement lines for the Altman Z'' and Beneish M scores. NOT APPLIED: run it in the Supabase SQL
-- editor (safe to run twice). The app works before and after: it only sends these columns when they hold a value.
--   retained_earnings   balance sheet: retained earnings (often "Other equity - retained earnings")
--   cost_of_goods_sold  income statement: cost of goods sold, only where the filing prints one
--   sga_expense         income statement: selling, general and administrative expense, only where printed
-- Indian filings usually present expenses by nature (employee cost, other expenses) and print neither of the last
-- two, so the Beneish M score will be blank for most of them; Altman Z'' needs only retained earnings.

alter table sentinel_statements add column if not exists retained_earnings numeric;
alter table sentinel_statements add column if not exists cost_of_goods_sold numeric;
alter table sentinel_statements add column if not exists sga_expense numeric;
