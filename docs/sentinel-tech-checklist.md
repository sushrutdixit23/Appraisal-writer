# Sentinel: technology companies, step by step

Work top to bottom. Tick a step only when you have seen it work. Where a step says "tell Claude", paste what
you saw (text or screenshot) and stop there until it is sorted.

## A. Is the new version live?
- [ ] A1. Vercel > appraisal-writer > Deployments: the latest deployment on `main` says **Ready**.
- [ ] A2. Open zyntask.in/sentinel and hard refresh (Ctrl+Shift+R). You see the parchment and Oxford-blue look.
- [ ] A3. Vercel > Settings > Environment Variables has `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`. (If a page says "supabaseUrl is required", one is missing.)

## B. Clear out the tyre companies
- [ ] B1. Supabase > Database > Backups: confirm a recent backup exists (or take one). This is permanent.
- [ ] B2. SQL editor: run **step 1 only** of `supabase/scripts/remove_tyre_reference_companies.sql`. It lists five
  companies. If you see anything else, stop and tell Claude.
- [ ] B3. Run step 2 (everything from `begin;` to `commit;`). The check query before `commit` must return no rows.
- [ ] B4. Reload /sentinel/projects: the tyre reference companies are gone. Any companies you made yourself are still there.

## C. Lock down access (do this before real data goes in)
- [ ] C1. Read the header of `supabase/migrations/20261027000000_sentinel_rls_proposed.sql`. Check that
  `sentinel_investigations`, `sentinel_recommendations` and `sentinel_review_cycles` each have a `workspace_id` column.
- [ ] C2. Run it in the SQL editor. Any error: stop and tell Claude.
- [ ] C3. With two different logins (A and B): A creates a project; B cannot see it in the list or by pasting its address.
  A cannot edit a company B owns.

## C2. Apply the three database steps (one at a time, in this order)
Each is safe to run twice and the app works before and after. Run them in the Supabase SQL editor.
- [ ] C2a. `supabase/migrations/20261028000000_sentinel_audit.sql`: change history and where each figure came from.
  Then save one period and open the project Overview: "Recent changes" lists it.
- [ ] C2b. `supabase/migrations/20261029000000_sentinel_score_fields.sql`: retained earnings, cost of goods sold and
  SG&A. Then the Altman Z\u2033 tile can fill in for a company that has retained earnings entered.
- [ ] C2c. `supabase/migrations/20261030000000_sentinel_operating_metrics.sql`: operating metrics. Then the
  "Operating metrics" panel on a project Overview can save.

## D. Choose the companies
- [ ] D1. Pick 5 to 6 listed technology companies of similar business (for example large Indian IT services firms).
  Peers are compared only inside one sector, so keep them alike: do not mix services with product or platform companies.
- [ ] D2. For each company, download from its investor page or BSE/NSE: the last 3 annual reports (PDF), and the
  latest quarterly results. Keep **consolidated** statements; note any company that only files standalone.
- [ ] D3. Make a one-line note per company: name, year-end month, reporting unit (crore, million or lakh), and whether
  revenue is mostly in foreign currency.

## E. Create each project
- [ ] E1. /sentinel/new-project: name, **Technology** sector (the default now), the real fiscal-year start month,
  **consolidated** basis, and the unit the filing prints.
- [ ] E2. The new project's Overview opens with a setup checklist. Follow it.
- [ ] E3. Import the annual report PDF (Import page). Read the preview period by period before confirming: right
  year, right unit, right basis (not standalone).
- [ ] E4. Any figure marked "verify" or flagged by the quote check: open the filing page and compare by eye. Fix it
  in Manage Periods. Do not accept a flagged figure unchecked.
- [ ] E5. Fill what the PDF reader left blank, in particular total assets, current liabilities, finance costs, total
  debt, cash and equivalents, cash from operations. The new return and coverage ratios stay "-" without these.
- [ ] E6. Enter three full years per company (ROE, ROCE and growth need the prior year).

## F. Check the numbers are right (the most important part)
For each company, with the filing open next to the screen:
- [ ] F1. Revenue, PBT, PAT, total assets, total equity: all five match the filing exactly, in the right unit.
- [ ] F2. The app raised no "balance sheet does not balance" or "PAT differs" warning, or you understand why.
- [ ] F3. Work out one ratio by hand and compare: ROCE = (PBT + finance costs) / (total assets - current liabilities),
  averaged over opening and closing. Interest cover = (PBT + finance costs) / finance costs. They must match the
  KPI page to the displayed decimals.
- [ ] F4. Compare 3 companies' revenue and PAT to an independent source (Screener.in or the exchange). Differences
  you cannot explain (restatement, consolidated vs standalone) go to Claude.
- [ ] F5. Switch the display unit (crore, lakh, million) from the command palette (Ctrl+K): figures change, ratios do not.

## F2. The screens and measures that need extra data
- [ ] F6. Enter retained earnings for one company's last two years. The **Altman Z\u2033** tile fills in; check it by hand:
  6.56 x (current assets - current liabilities)/assets + 3.26 x retained earnings/assets + 6.72 x EBIT/assets +
  1.05 x equity/total liabilities. Above 2.6 safe, 1.1 to 2.6 grey, below 1.1 distress.
- [ ] F7. **Beneish M** stays "-" for most Indian filers, because it needs cost of goods sold and SG&A, which they
  usually do not print. Do not invent them. If a company does print both, enter them for two years and check the score.
- [ ] F8. Operating metrics: from one company's latest investor presentation enter attrition, utilisation and headcount
  with the page you read them from. Generate a narrative: it may quote only those figures and must not mention
  attrition or utilisation for a company where you entered none.
- [ ] F9. Change one figure on an existing period and save. "Recent changes" on the Overview shows the old and new value.
  Import a PDF: for an AI-read figure, hover or read its source line; it names the page and the quoted row.

## G. Check what Sentinel tells you
- [ ] G1. KPIs: every tile has a value or a "-" you can explain; click the "i" on three tiles and confirm the formula
  text is what you would accept.
- [ ] G2. Peers and trends: the company is ranked among the others; the peer table lines up in one unit.
- [ ] G3. Health score: each category's status and its wording make sense. Note any that you disagree with: the sector
  thresholds are starting assumptions and are meant to be tuned against what you see.
- [ ] G4. Investigation queue: flags appear for real swings. For two flags, decide whether each is a real finding or noise.
- [ ] G5. Generate a narrative for one flagged company. Read it against the numbers: no figure that is not in the data,
  no cause stated as fact that the data does not show (attrition, currency, deal ramp).
- [ ] G6. Approve one draft, reject one with a note, edit one. Reload: each state stuck.
- [ ] G7. Export PDF, PowerPoint and Excel for one company. Open each: figures and unit match the screen.

## H. Measure the AI reader honestly
- [ ] H1. Choose 10 statements across at least 3 companies. For each of 10 fields, two people read the value off the page
  independently and agree (a third settles disagreements). Record page number and unit.
- [ ] H2. Write them to a ground-truth file in the format in `docs/sentinel-ground-truth.md`, and save what the app
  extracted for the same filings.
- [ ] H3. Run `npm run score:extraction -- ground-truth.json predictions.json`. Read the report: wrong values,
  invented values, and which fields fail most.
- [ ] H4. Hold one company out as the "test" company and do not tune the prompt on it.

## I. Safety and running costs
- [ ] I1. Call the AI extraction 21 times in 10 minutes as one user: the 21st is refused with "Too many requests".
- [ ] I2. Anthropic console: set a monthly spend limit.
- [ ] I3. GitHub > Actions: the "Sentinel checks" workflow is green on `main`.

## J. Sign off
- [ ] J1. Keep a list of every wrong number you found, which company, which field, and why. That list is the real
  measure of quality; send it to Claude to fix the cause rather than the single value.
- [ ] J2. Ready to rely on it when: F is clean for every company, H shows no invented values, and C is verified.

Not covered yet, by design: XBRL as the primary source; per-figure "confirmed by" sign-off; a change history for
operating metrics; comparing operating metrics across peers; and Beneish M for companies whose filings do not print
cost of goods sold and SG&A.
