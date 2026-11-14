# Sentinel notes reader - scorecard

Run on 2026-11-14 over the PDFs in `/tmp/claude-0/-home-user-Appraisal-writer/90da04b1-bf1d-5bfb-88bc-62dfc03e3e3e/scratchpad/ar2`. Not a claim of accuracy: see the end of this file.

## What each reader found, per report

A zero means the reader did not recognise that note in that report. It is not a statement that the note is clean.

| Report | Pages | Receivables ageing | Ratios the company discloses | Auditor's CARO answers | Contingent liabilities | When borrowings fall due | Related-party transactions | High | Medium | Time |
|---|---|---|---|---|---|---|---|---|---|---|
| infosys | 383 | 2 | 9 | 9 | 2 | 10 | 0 | 0 | 0 | 0.3s |
| tcs | 360 | 8 | 10 | 10 | 3 | 0 | 68 | 0 | 1 | 0.2s |

## Tie-outs: receivables gross less allowance against the net figure printed on the page

| Report | Tables | Tied | No match | Not testable | No-match pages |
|---|---|---|---|---|---|
| infosys | 2 | 2 | 0 | 0 | - |
| tcs | 8 | 8 | 0 | 0 | - |

No match is not proof of an error (a report may print its net on another page); it is the list to look at first.

## Statement figures against figures typed from the filing

| Report | Period | Fields | Match | Wrong | Missing | Match rate (95% interval) | Wrong values |
|---|---|---|---|---|---|---|---|
| infosys | FY26 standalone | 24 | 22 | 1 | 1 | 92% (74%-98%) | trade_receivables: got 30337, typed 44043 |
| tcs | FY26 standalone | 23 | 23 | 0 | 0 | 100% (86%-100%) | - |

A missing figure is a gap; a wrong one is a danger. Both are counted against the reader.

## Findings raised (high and medium)

### infosys (20 clauses (unknown))

- nothing at high or medium

- statement reader: 2 period(s) read in 2.5s load + 0.3s read

### tcs (20 clauses (standalone))

- **medium** [Receivables ageing] p.184: 8.5% of trade receivables has been outstanding over a year past its due date

- statement reader: 2 period(s) read in 3.9s load + 0.2s read

## What this scorecard does not show

- Precision of the findings. That needs a person to look at `items.csv` against the PDF and fill the verdict column; then run `npm run score:notes -- --marked items.csv`.
- Recall. Nobody has listed every receivables table, CARO answer or contingent liability in these reports, so what was missed is unknown.
- Anything about reports that were not in the folder. The author chose these; a different set will give different numbers.
