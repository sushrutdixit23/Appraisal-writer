# Accuracy scorecard

`npm run score:notes -- <folder of annual-report PDFs> [--truth truth.json] [--out dir] [--backtest backtest.json]`

Anyone with the same PDFs gets the same numbers. It does not grade the reader against the reader's own opinion; it uses three kinds of evidence:

1. **Tie-outs** - a number the reader extracted must agree with another number printed in the same report (receivables gross less allowance equals the net the table prints).
2. **Typed ground truth** (`truth.json`) - statement figures compared with figures a person typed from the filing (the CSVs in `tests/sentinel/fixtures`), with missing and wrong counted separately.
3. **A sheet for an outside checker** (`items.csv`) - every extracted item with its page and the text it came from, and an empty verdict column. Mark each row right / wrong / partly, then `npm run score:notes -- --marked items.csv` gives precision per reader with a 95% interval. **This is the real test; nobody who is not the author has done it yet.**

## First run, 2026-10-30, five FY26 reports (TCS, Infosys, Tech Mahindra, Wipro, HCLTech)

See `run-2026-10-30/scorecard.md`. In short:

- Each reader recognised most of its notes in most reports. Where it did not (borrowings maturity for TCS and HCLTech, related parties for Infosys, Wipro and HCLTech) the table says "0", which means *not read*, not *clean*.
- Receivables: 22 of 22 ageing tables tie to the net figure the report prints on the same page.
- **Statement figures read from a full integrated annual report are the weak point**: 58% (Infosys) and 65% (TCS) of 24 and 23 typed fields matched, with 3 and 1 wrong and 7 and 7 missing. The statement reader was built and tested on pages cut out of a filing; on a 400-page report it picks the wrong pages for some fields. Until that is fixed, the notes findings that need the company's scale ignore a base that looks wrong, and the Import page should be pointed at the statement pages, a spreadsheet or an XBRL file.
- Findings at high severity: Tech Mahindra 2 (both CARO answers, in the auditor's own words), Wipro 2 (borrowings due within a year), none for TCS, Infosys or HCLTech. Medium: Tech Mahindra 3, Wipro 1, TCS 1.

## Second run, 2026-11-14: statement figures from whole reports (TCS, Infosys)

See `run-2026-11-14/scorecard.md`. Only the two reports with typed ground truth were still available, so this run covers those two.

| Report | Before (2026-10-30) | After |
|---|---|---|
| TCS FY26 standalone | 15 of 23 match (65%), 1 wrong, 7 missing | **23 of 23 (100%, interval 86%-100%)** |
| Infosys FY26 standalone | 14 of 24 match (58%), 3 wrong, 7 missing | **22 of 24 (92%, interval 74%-98%)**, 1 wrong, 1 missing |

The previous year in the same reports went from 10 and 0 fields read to 25 and 23. The notes findings did not change.

What was wrong, in order of effect:
1. **Page choice.** The reader took the financial-highlights table in the directors' report, and tax and segment notes, because they repeat the statement line items. It now reads only the audited primary statements when it can tell them apart (their title, or their Note column), and takes an untitled statement page's basis from the nearest titled one.
2. **A phantom column.** The running page head ("Integrated Annual Report 2025-26") was read as a fiscal-year column, shifting every figure one column right: the previous year was lost and the current year could be read from the wrong column.
3. **Lettered note references** ("8(a)") stayed on the label, so the line was not recognised.
4. **Headings with their figures below** (trade receivables as Billed and Unbilled; trade payables as the two statutory lines) are now added up and marked as worked out.
5. **Two "missing" figures per report were a measuring error**: the truth file named two fields differently from the reader (`depreciation_and_amortisation`, `cash_and_cash_equivalents`). The keys are corrected; the typed values are unchanged.

Still wrong for Infosys: its typed trade receivables include unbilled revenue, which Infosys prints in a note, not on the balance sheet, so the statement reader cannot see it.

**Limits of this result.** The fixes were developed on these same two reports, so this is not a held-out test: it shows the faults are fixed here, not how the reader does on a layout it has not seen. Two reports, both large IT-services companies. The synthetic tests (`tests/sentinel/autofill-annual-report.test.ts`) fix the behaviours, one of them mutation-checked.

## What this does not show

- Precision of the findings (needs the checker's sheet).
- Recall: nobody has listed every table or clause in these reports, so what was missed is unknown.
- Anything outside these five reports, which the author chose.
