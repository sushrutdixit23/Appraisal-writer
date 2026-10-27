# Sentinel audit: data entry, extraction, calculations, access

Scope: the TypeScript Sentinel in this repo (`app/sentinel`, `app/api/sentinel`). Not the Python
Streamlit prototype. Everything below was checked by running the code, not by reading it.

How it was checked:

- `npm run test:sentinel` - 171 tests, no new dependencies. Calculations use hand-worked numbers.
  The API routes run against an in-memory Supabase and Anthropic served over real HTTP, so the real
  `supabase-js` and Anthropic SDK code paths execute. Extraction runs on real PDFs built from fake
  figures. Several tests were mutation-checked (break the rule, watch the test fail).
- `tests/sentinel/e2e/browser.cjs` - 31 real-browser checks (Playwright) against `next dev` with two
  signed-in users. Run instructions are at the top of that file.
- `next build` passes, and the built server was smoke-tested on the PDF route.

## 1. Ways data gets in

| Path | Where | What it does |
| --- | --- | --- |
| New Project | `/sentinel/new-project` | Describe the company, then the first period. Typed or pre-filled from a PDF. |
| Manage Periods | `/sentinel/add-period` | Add, edit, delete periods for companies you own. Typed or PDF. Also rename or delete the company. |
| Data Entry | `/sentinel/data-entry` | Same fields, but saves through `/api/sentinel/statement`, so the server checks ownership and accounting. Not linked from the sidebar. |
| PDF upload | inside the first two | Text PDFs only. Under 4MB goes straight to the route; larger goes via Vercel Blob. |
| Seed script | `scripts/seed_sentinel.py` | Loads the five reference tyre companies. |

There is **no image input and no OCR**. A scanned PDF is refused with a message. If you remember
scanning, it was not in this codebase. Adding it (send the pages to Claude as images or a PDF
document block) is a decision for you; see section 6.

## 2. What extraction does now

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

Decisions:

1. **Image or scanned-PDF input.** Not built. Doing it means sending page images or the PDF itself to
   Claude. Say if you want it.
2. **Peer outlier detector** now fires where it never could. Expect new "peer_outlier" flags on the
   reference data. The threshold (2.0) is unchanged.
3. **Prior year is same-basis only.** A company whose last year is standalone and this year consolidated
   has no YoY until a matching year exists. The alternative is a silent, wrong comparison.
4. **Reporting-unit default** on New Project is now crore (was lakh).
5. **Data Entry page** is still unlinked from the sidebar. Keep, link or remove?
