# Sentinel notes reader - scorecard

Run on 2026-10-30 over five FY26 annual reports (TCS, Infosys, Tech Mahindra, Wipro, HCLTech). Not a claim of accuracy: see the end of this file.

## What each reader found, per report

A zero means the reader did not recognise that note in that report. It is not a statement that the note is clean.

| Report | Pages | Receivables ageing | Ratios the company discloses | Auditor's CARO answers | Contingent liabilities | When borrowings fall due | Related-party transactions | High | Medium | Time |
|---|---|---|---|---|---|---|---|---|---|---|
| hcltech | 462 | 4 | 27 | 10 | 1 | 0 | 0 | 0 | 0 | 0.5s |
| infosys | 383 | 2 | 9 | 9 | 2 | 10 | 0 | 0 | 0 | 0.4s |
| tcs | 360 | 8 | 10 | 10 | 3 | 0 | 68 | 0 | 1 | 0.3s |
| techmahindra | 683 | 4 | 10 | 10 | 10 | 18 | 68 | 2 | 3 | 0.5s |
| wipro | 548 | 4 | 14 | 9 | 3 | 52 | 0 | 2 | 1 | 0.4s |

## Tie-outs: receivables gross less allowance against the net figure printed on the page

| Report | Tables | Tied | No match | Not testable | No-match pages |
|---|---|---|---|---|---|
| hcltech | 4 | 4 | 0 | 0 | - |
| infosys | 2 | 2 | 0 | 0 | - |
| tcs | 8 | 8 | 0 | 0 | - |
| techmahindra | 4 | 4 | 0 | 0 | - |
| wipro | 4 | 4 | 0 | 0 | - |

No match is not proof of an error (a report may print its net on another page); it is the list to look at first.

## Statement figures against figures typed from the filing

| Report | Period | Fields | Match | Wrong | Missing | Match rate (95% interval) | Wrong values |
|---|---|---|---|---|---|---|---|
| infosys | FY26 standalone | 24 | 14 | 3 | 7 | 58% (39%-76%) | fixed_assets: got 11286, typed 10774; cash_from_investing: got 1946, typed 4086; cash_from_financing: got -39786, typed -37787 |
| tcs | FY26 standalone | 23 | 15 | 1 | 7 | 65% (45%-81%) | total_expenses: got 162977, typed 164101 |

A missing figure is a gap; a wrong one is a danger. Both are counted against the reader.

## Findings raised (high and medium)

### hcltech (20 clauses (unknown))

- nothing at high or medium

- statement reader: 2 period(s) read in 5.1s load + 0.5s read

### infosys (20 clauses (unknown))

- nothing at high or medium

- statement reader: 4 period(s) read in 4.7s load + 0.4s read

### tcs (20 clauses (standalone))

- **medium** [Receivables ageing] p.184: 8.5% of trade receivables has been outstanding over a year past its due date

- statement reader: 2 period(s) read in 8.6s load + 0.3s read

### techmahindra (20 clauses (standalone))

- **high** [Auditor's CARO answers] p.437: The auditor's CARO answer on fraud is not the clean one (standalone)
- **high** [Auditor's CARO answers] p.551: The auditor's CARO answer on group companies' caro answers is not the clean one (consolidated)
- **medium** [Receivables ageing] p.632: 8.5% of trade receivables has been outstanding over a year past its due date
- **medium** [Receivables ageing] p.632: 5.1% of trade receivables is marked credit impaired
- **medium** [Auditor's CARO answers] p.435: The auditor's CARO answer on title deeds of immovable property is not the clean one (standalone)

- statement reader: 2 period(s) read in 7.9s load + 0.5s read

### wipro (20 clauses (standalone))

- **high** [When borrowings fall due] p.231: 100% of borrowings fall due within a year (33% of the liabilities in the table)
- **high** [When borrowings fall due] p.332: 99% of borrowings fall due within a year (51% of the liabilities in the table)
- **medium** [Receivables ageing] p.333: 3.4% of trade receivables is marked credit impaired

- statement reader: 3 period(s) read in 6.7s load + 0.4s read

## What this scorecard does not show

- Precision of the findings. That needs a person to look at `items.csv` against the PDF and fill the verdict column; then run `npm run score:notes -- --marked items.csv`.
- Recall. Nobody has listed every receivables table, CARO answer or contingent liability in these reports, so what was missed is unknown.
- Anything about reports that were not in the folder. The author chose these; a different set will give different numbers.
