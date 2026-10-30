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
- Findings raised at high severity: Tech Mahindra (3, all in the auditor's own words and all confirmed by reading the pages), Wipro (2, borrowings due within a year). None for TCS, Infosys, HCLTech.

## What this does not show

- Precision of the findings (needs the checker's sheet).
- Recall: nobody has listed every table or clause in these reports, so what was missed is unknown.
- Anything outside these five reports, which the author chose.
