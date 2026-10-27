# Sentinel audit: data entry, extraction, calculations, access

Scope: the TypeScript Sentinel in this repo (`app/sentinel`, `app/api/sentinel`). Not the Python
Streamlit prototype. Everything below was checked by running the code, not by reading it.

How it was checked:

- `npm run test:sentinel` - 277 tests, no new dependencies. Calculations use hand-worked numbers.
  The API routes run against an in-memory Supabase and Anthropic served over real HTTP, so the real
  `supabase-js` and Anthropic SDK code paths execute. Extraction runs on real PDFs built from fake
  figures. Several tests were mutation-checked (break the rule, watch the test fail).
- `tests/sentinel/e2e/browser.cjs` - 48 real-browser checks (Playwright) against `next dev` with two
  signed-in users. Run instructions are at the top of that file.
- `next build` passes, and the built server was smoke-tested on the PDF route.

## 1. Ways data gets in

| Path | Where | What it does |
| --- | --- | --- |
| New project | `/sentinel/new-project` | One screen creates an empty project you own and opens its Overview. |
| Add period | `/sentinel/data-entry` (nav: Add period) | One period, typed or filled from a file. Saves through `/api/sentinel/statement`, so the server checks ownership and accounting. Opens on the project you are in. |
| Import files | `/sentinel/projects/[id]/import` | One or more PDF, CSV or Excel files; every period found is previewed, checked and saved on confirmation. |
| Edit periods | `/sentinel/add-period` | Add, edit, delete periods of companies you own. Rename and delete the company moved to Settings. |
| Autofill | inside Add period, Edit periods and Import | Rules, no model: see section 7. |
| Seed script | `scripts/seed_sentinel.py` | Loads the five reference tyre companies. |

There is **no image input and no OCR**. A scanned PDF is refused with a message. If you remember
scanning, it was not in this codebase. Adding it (send the pages to Claude as images or a PDF
document block) is a decision for you; see section 6.

## 2. What the AI extraction does (now an opt-in button, not the default)

Autofill (section 7) is the default way to read a file and never calls a model. The model-based reader
below is still there as "Fill the blanks with AI", for a PDF where the rules left fields empty.

1. Reads the PDF page by page, scores each page as "is this a financial statement" (headings, distinct
   line items, rows of figures; contents pages and directors' letters are penalised).
2. Keeps only the statement pages, and only the basis the company is compared on (standalone vs
   consolidated) when the pages say which is which.
3. Reads the unit from those pages ("Rs. in crore", "in lakhs", "in million"...).
4. Asks the model to label figures: current-year column only, sign conventions spelled out, never add
   figures itself.
5. Checks the reply in code: every figure must appear in the text it was given; the accounting
   identities must hold; anything that fails is marked "(verify)" on the field.
6. The form converts from the filing's unit to the company's unit, so a crore filing in a lakh company
   is not 100x wrong.

Nothing is saved until a person reviews the form and saves.

## 3. Calculations: what was wrong

| Calculation | Problem | Fix |
| --- | --- | --- |
| PAT growth on a loss base | Divided by the signed prior figure: loss -100 to -50 read as -50%, a turnaround from -560 to +1,896 read as -438% | Divide by the size of the prior figure. Loss narrowing is +50%. |
| Days ratios on a quarter | Always x365, so every quarterly inventory/receivable/payable/cash-cycle figure was 4x too high | 365 for a year, 91.25 for a quarter |
| Debt to equity, equity <= 0 | A negative ratio that graded as the healthiest balance sheet | No ratio; flagged as a leverage anomaly; graded Critical |
| Peer outlier detector | Scored a company against a mean and deviation that included itself. With 5 companies its maximum possible score is exactly 2.0 and the test is "greater than 2.0", so it could never fire | Scores against the other companies (needs 3 or more) |
| Exceptional items | A large exceptional gain was never measured; pre-exceptional PBT of a loss-maker used a signed denominator | Absolute size against absolute pre-exceptional PBT; says gain or loss |
| Prior year | Ignored basis: a consolidated year could be compared with a standalone one | Same basis only |
| Latest period tie | Standalone and consolidated for the same date: whichever row arrived first | Company's own basis wins |
| Company comparison | Absolute figures (rank by revenue, closest peer, gap in crore, trend overlay) mixed lakh, million and crore companies | Converted to crore once, in `buildPeerTable` |
| Health banding | A margin fall of exactly 2pp (2.0000000000000004) graded one band worse | Rounded before banding |
| Executive dashboard | "Awaiting review" was companies minus findings; "Reviewed" counted pending drafts | Counted from finding status |
| Financial Statements YoY | Compared the last two columns, which could be two years apart or two bases | Latest vs the real prior year, labelled |
| Money labels | Narrative and health text called lakh figures "crore" | Labelled in the company's unit |

Checked and found correct: EBITDA margin, PAT margin, revenue growth, current ratio, debt to equity
(positive equity), YoY threshold flags, liquidity/leverage/working-capital flags, the confidence
score arithmetic, health bands and the overall grade, benchmark rank and percentile, the Excel YoY and
common-size formulas.

Known approximations, unchanged: inventory and payable days use total expenses as a cost-of-goods
proxy (the schema has no COGS); EBITDA is entered, not derived; the health "2 percentage points" and
"OCF/PAT 0.7" references are unvalidated starting assumptions, as the code already says.

## 4. Access: what was wrong

The browser pages rely on Supabase row-level security. The server routes use the service-role key,
which **bypasses** it, and they did not check ownership.

| Hole | Fix |
| --- | --- |
| Anyone signed in could write statements into any company by id, including reference companies and other users' (`/api/sentinel/statement`) | Owner only; reference companies are read-only |
| The statement route wrote any column the caller sent (including `id`) | Only known columns are kept |
| Narrative generation and all three exports built the peer set from every company in the sector, including other users' private ones, so their names and figures could appear in your prompt, flags and files | Peer set is reference companies plus your own |
| Anyone could generate or export for any company id | Must be able to read the company; otherwise it answers "not found" |
| The PDF and PowerPoint exports returned every user's investigations on a shared reference company | Only yours |
| The extract route fetched any URL it was given (server-side request forgery) | Only Vercel Blob URLs this app issued |
| Uploaded filings stayed on public Blob storage forever | Deleted as soon as read; random file names |
| A company name with a quote or newline broke the download header | Sanitised file names |
| A refused first statement left an empty company behind (API and New Project) | Validate first; remove the company if the save fails |
| Company pickers started from "whatever came back first", and each page forgot your choice | Own companies first, one remembered selection across pages, `?workspace=` honoured |
| Data Entry needed a pasted workspace UUID | Dropdown of your companies |

## 5. Entry bugs fixed

- Cash-flow fields were saved and extracted but had **no input on either form**; extraction filled them
  invisibly. Four balance-sheet fields existed only on the legacy page. One field list now drives every
  form, the prompt and the validation.
- Editing a period you had just saved showed the old values (the list was not reloaded), so an "update"
  could silently revert your edit.
- Saving always stamped the company's basis on the statement; the PDF's basis was thrown away.
- Text that is not a number was silently dropped to blank. Pasted figures like `1,234.5` or `(123.4)`
  emptied the number inputs. Both now work or say so.
- No duplicate check in the app: saving the same period twice relied on the database's unique key to refuse it, with a raw error. The form now says it exists and points to Edit.
- Company delete carried on after a failed step and left a half-deleted company.
- Negative equity was a hard error; it is now a warning (it is a real, if rare, balance sheet).
- The Investigation Queue crashed entirely if one investigation had no confidence signals.
- **`pdf-parse` could not be bundled by Next**: every PDF upload returned 500 under `next dev`
  ("Object.defineProperty called on non-object"). Fixed with `serverExternalPackages` in
  `next.config.ts`.

## 6. Not verified, and decisions for you

Not verified (needs your Supabase, API key or Vercel):

- **Row-level-security policies.** They are not in this repo. Please confirm in Supabase that
  `sentinel_workspaces`, `sentinel_statements`, `sentinel_investigations`, `sentinel_recommendations`
  and `sentinel_review_cycles` allow SELECT for `owner_id = auth.uid()` or reference companies, and
  write only for the owner. The pages depend on this.
- **The database trigger** the forms mention (balance sheet, negatives). If it rejects negative total
  equity, those saves will still fail at the database even though the app now allows them.
- **A live model call.** The model is faked in tests; I checked what it is sent and what the route does
  with any reply, not how well Claude reads a real filing. Try a real annual report first.
- **Vercel Blob** for files over 4MB (the upload and delete path), and Vercel deployment itself.
- `npm run lint` fails before and after my changes (the ESLint config import does not resolve).
- The Next docs folder `AGENTS.md` points to does not exist in the installed Next 15.5.22, so I kept to
  the route-handler patterns the code already uses.

Decisions (1 is still open; 2 to 5 were answered "ok", "ok", "lakh switch", "link it"):

1. **Image or scanned-PDF input.** Not built. Doing it means sending page images or the PDF itself to
   Claude, which conflicts with "no explicit use of Claude" for the default path. Say if you want it as
   another opt-in button.
2. **Peer outlier detector** fires where it never could. Expect new "peer_outlier" flags on the
   reference data. The threshold (2.0) is unchanged.
3. **Prior year is same-basis only.** A company whose last year is standalone and this year
   consolidated has no YoY until a matching year exists.
4. **Reporting unit**: crore is the default for new projects, and lakh, million, thousand, billion and
   plain rupees are all available, per project (Settings) and for display (the top-bar switch).
5. **Data Entry** is linked, as "Add period" in each project's nav.

## 7. Autofill from PDF, CSV and Excel (no AI)

`app/sentinel/lib/autofill/*`, route `/api/sentinel/autofill`. The same file gives the same answer every
time, costs nothing, and every figure carries the line it was read from ("p.5 | Revenue from operations |
1,000.00 900.00" or "row 12 | Revenue").

- **PDF**: scores pages, keeps the statement pages (P&L, balance sheet, cash flow), reads column headers
  into periods (FY26, FY2025-26, Q3 FY26, "Year ended 31 March 2026", 31.03.26, Mar-26...), drops the
  note-number column, joins wrapped labels, applies a weighted label table per statement, and handles
  bracketed negatives. The standalone and consolidated sets are told apart by their headings.
- **Derived figures** (EBITDA, total debt, total liabilities...) are worked out only from lines that were
  read, are labelled "derived", and are marked "verify".
- **Accounting checks** run over what was read (balance sheet, income identities); a failing check lowers
  the confidence of the fields involved.
- **CSV and Excel**: line items down with periods across, or one row per period; delimiter detection;
  Windows-1252 fallback (Excel's "CSV (Comma delimited)"); `.xlsx` through `exceljs`; old `.xls` is
  refused with how to convert it.
- **Units**: the file's unit is read from the page or sheet ("Rs. in lakhs"), shown, editable, and the
  figures are converted into the project's unit before they reach the form.
- **Import** (several periods at once) shows each period as New, Replaces, Cannot import or Skipped.
  A period already on file is **not** ticked by default; the same period in two files keeps the one with more
  figures. Derived and low-confidence figures are written into the saved period's notes, because an import has
  no form to show the per-field captions in.

Known limits: scanned or image-only PDFs have no text and are refused with a message. Layouts were
tested on synthetic filings built to mimic real traps (contents pages, standalone next to consolidated,
note columns, wrapped labels, two year columns); **not on real filings, none of which I could reach from
here**. Try a real one and send me whatever it gets wrong; the label table (`labels.ts`) is built to be
extended from exactly that.

## 8. Units: display versus reporting

- **Display** (top bar, or Ctrl+K then "lakh", "lac", "lacs", "crore", "million"): changes how amounts are
  shown on KPI, Statements (and its CSV), Peers and trends, Overview, and in the PDF, PowerPoint and Excel
  exports. Nothing stored changes. Peer figures are held in crore and convert from there; a company's own
  figures convert from its reporting unit. The health-check sentences ("Revenue of ₹1,000.0 cr...") are written
  in the company's own unit and are not re-converted.
- **Reporting unit** (Settings): *Convert* rescales every amount of every period (crore to lakh multiplies
  by 100); *Only fix the label* changes the unit and leaves the numbers (they were typed in lakh under a
  crore label). The page shows the latest revenue before and after for whichever is chosen. The route
  rewrites all periods in one request, then the unit; if the second step fails the first is put back.
  Narratives already written quote the old unit, so the page says how many to regenerate.
- The PDF used to print amounts with no unit at all, and its font has no rupee glyph (it printed a
  superscript "1"). It now names the unit and writes "Rs".

## 9. The project shell

See `docs/sentinel-ux.md`. Projects home, a project Overview with a self-ticking setup checklist, a project
switcher, a per-project side nav, a command palette, create-only New project, Settings (including the
unit change and a typed-name delete), and multi-period Import.

## 10. What a top professional would add next

In order of value for the effort:

1. **Check it against real filings, and keep checking.** A "golden set" of 20 to 30 real filings (different
   sectors, layouts and units) with hand-keyed answers, scored per field. It is the only honest measure
   of the autofill, and it turns every miss into a test. Needs real files from you.
2. **Exchange XBRL as the primary source for listed companies.** Results are filed to the exchanges in a
   structured, tagged form. Reading tagged data is deterministic and removes the layout problem for
   those companies; the PDF reader becomes the fallback for the rest. Worth a spike to confirm the
   exact files and licence terms; I could not verify them from here.
3. **Persist where each figure came from.** Today the provenance ("p.5 | Revenue...") is shown while you
   work and kept only in the period's notes after an import. Store it per field, with a "confirmed by"
   state, so a reviewer sees what was read, what was worked out and what a person signed off.
4. **An audit trail and restatements.** Who changed which figure and when; and the next year's filing
   restates last year, so keep "as filed" and "restated" versions instead of one row per period.
5. **Quarterly mechanics.** Q4 = full year less nine months, trailing twelve months, and year-on-year
   against the same quarter last year (not the previous quarter).
6. **The ratios a credit or audit reviewer reaches for.** ROCE and ROE, interest cover, DSCR, net debt to
   EBITDA, cash flow from operations to PAT, accruals ratio, and the standard manipulation screens
   (Beneish M-score, Altman Z). A "Sentinel" should screen for earnings quality, not only compute margins.
7. **Auditor's report and notes as flags**: qualified or emphasis-of-matter opinions, related-party
   transactions, contingent liabilities, going-concern language.
8. **Peer sets you choose**, calendarised to a common year-end, using median and spread instead of mean.
9. **Budget versus actual and covenants**, with variance bridges: the CFO's monthly job.
10. **Roles and review**: `WorkspaceMember` exists in the types but is not wired. Owner, analyst, viewer,
    comments on a figure, sign-off.
11. **Operations**: the row-level-security policies and triggers are not in this repo, so they are not
    reviewed or tested with the code. Put them in migrations, test them against a local Supabase, and
    run `npm run test:sentinel`, `next build` and the browser checks in CI (there is no CI today).
    Rate-limit the AI endpoints.

## 11. Not verified (added)

- Autofill on **real** filings (see section 7).
- Everything that needs your Supabase: the live RLS policies and triggers, and the real session behaviour
  of the shell's project list.
- The unit-change route is atomic per request (one upsert), not a database transaction across the
  statements and the project. A crash between the two steps is handled by the put-back, but a concurrent
  edit of a period during a conversion could be overwritten. Fine for one person, worth a database
  function if several people edit the same project.
- A scanned PDF is refused; there is no OCR.
