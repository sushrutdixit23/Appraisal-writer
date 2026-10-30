# Backtest protocol: would Sentinel's notes reader have flagged these companies before they failed?

**Status: pre-registered. Written before any report has been run through the reader.** Nothing in this file may be changed after a result is seen; if it must be, add a dated amendment at the end and say why.

## The question

For a company that later failed, did the annual report published **before** the failure contain something Sentinel's reader flags at high severity? And, just as important, for a comparable company that did not fail, how often does it flag the same thing (a false alarm)?

## What is counted as "flagged"

A report is **flagged** if the reader raises at least one finding of severity **high** from any of: CARO answers, receivables ageing, borrowings maturity, related-party exposure, contingent liabilities, or the auditor's report (qualified, adverse or disclaimer opinion; going-concern material uncertainty). Medium and information findings are counted and reported but are **not** a flag. This definition is fixed here so it cannot be adjusted to fit the results.

Reported for every report: number of high, medium and information findings; the top finding with its page; which readers recognised their note (a reader that did not recognise a note is "not read", never "clean").

## Cases (5) - failures, with the event and its source

Chosen because each has a public, dated, regulatory or court event and falls in the period (FY2021 onward) in which the annual report carries the CARO 2020 clauses, the Ind AS 107 maturity table and, from FY2022, the Schedule III ratio disclosure. Event dates were checked against press reports on 2026-10-30; the date of publication of each annual report must be confirmed from the company's filing before the run.

| # | Company | Report to test | Event | Event date | Source |
|---|---|---|---|---|---|
| 1 | Srei Infrastructure Finance | FY2020-21 | RBI supersedes the board; NCLT admits insolvency (8 Oct 2021) | 4 Oct 2021 | theweek.in/news/biz-tech/2021/10/04/rbi-supersedes-board-of-srei-group-companies-to-initiate-insolvency-proceedings.html |
| 2 | Reliance Capital | FY2020-21 | RBI supersedes the board; NCLT admits insolvency (6 Dec 2021) | 29 Nov 2021 | businesstoday.in/latest/corporate/story/rbi-action-against-rcl-all-you-need-to-know-about-reliance-capital-313826-2021-11-29 |
| 3 | Future Retail | FY2020-21 | NCLT starts corporate insolvency resolution | 20 Jul 2022 | futureretail.in FAQ (17 Oct 2022); livelaw.in/ibc-cases/nclt-mumbai-future-retail-liquidation-265218 |
| 4 | Brightcom Group | FY2021-22 | SEBI interim order: accounting misstatement over 31 quarters; statutory auditor faulted for not qualifying | Apr 2023 | moneylife.in/article/sebi-raps-brightcom-group-promoterdirectors-for-manipulating-account-books-asks-to-submit-statement-of-impact-of-noncompliances/70466.html |
| 5 | Gensol Engineering | FY2023-24 | SEBI interim order: diversion of funds, forged conduct letters | 15 Apr 2025 | theweek.in/wire-updates/business/2025/04/16/dcm141-biz-gensol-sebi.html |

Lead time = months from the annual report's publication to the event, computed per case once the publication date is known. A report published after the event is **excluded**, not counted.

## Controls (15) - comparable companies that did not fail in the following 24 months

Three per case, matched by **sector and fiscal year**, picked by the rule *largest listed companies in the same sector that had no insolvency, regulatory supersession, auditor resignation or SEBI fraud order in the 24 months after that report*. **Proposed by the author from memory; the user may veto any, and replacements must be chosen by the same rule before the run.** Two are deliberate **hard controls**: companies that were in real distress but survived, because those are where a false alarm is most likely and most informative.

| Case | Control 1 | Control 2 | Control 3 (hard control marked *) |
|---|---|---|---|
| Srei (FY21, infrastructure NBFC) | Cholamandalam Investment & Finance FY21 | Bajaj Finance FY21 | Shriram Transport Finance FY21 |
| Reliance Capital (FY21, diversified financial) | Bajaj Finserv FY21 | Aditya Birla Capital FY21 | HDFC Ltd FY21 |
| Future Retail (FY21, retail) | Avenue Supermarts FY21 | Trent FY21 | Shoppers Stop FY21 * (heavy losses in the pandemic, survived) |
| Brightcom (FY22, small-cap digital / IT services) | Sasken Technologies FY22 | Cigniti Technologies FY22 | Nucleus Software Exports FY22 |
| Gensol (FY24, EPC / renewable / EV) | KPI Green Energy FY24 | Waaree Renewable Technologies FY24 | Suzlon Energy FY24 * (restructured debt, recovered) |

## What is measured

- **Catch rate** = cases flagged / 5, with a 95% Wilson interval.
- **False-alarm rate** = controls flagged / 15, with a 95% Wilson interval, reported separately for the two hard controls.
- **Per-signal table**: which reader produced the flag in each case and control.
- **Lead time** for each case that was caught.
- **Not read**: for each report, the readers that did not recognise their note.

## Known limits, stated in advance

1. **Five cases cannot establish a catch rate.** With 5 cases the interval on any catch rate is wide (4 of 5 is roughly 38%-96%). The result can show whether the idea is worth pursuing; it cannot prove accuracy.
2. **Selection.** The author chose failures that are well known. Well-known failures are the ones with the loudest signals; the quiet ones are missing.
3. **Hindsight.** The author knows the outcomes. The protocol fixes the definition of "flagged" and the control rule in advance to limit this, and cannot remove it.
4. **NBFCs.** Cases 1 and 2 are financial companies reporting under Division III of Schedule III. They have no trade-receivables ageing and their key signals (stage-3 assets, asset-liability maturity, capital adequacy) are **not read at all** by the current reader. Only the CARO answers, the auditor's report and contingent liabilities apply. It is expected that these two cases will be caught, if at all, by those readers only, and that finding is itself a result.
5. **Pre-2021 failures** (IL&FS, DHFL, Jet Airways, Yes Bank, Satyam) are excluded because their reports predate CARO 2020 and the Schedule III ratio disclosure, so the readers' clause numbering and note layouts would not apply. Supporting CARO 2016 is a separate piece of work.
6. **Layouts.** The readers were developed on five FY26 reports (TCS, Infosys, Tech Mahindra, Wipro, HCLTech). A report with a different layout may be "not read". That is recorded, not hidden.
7. **Statement figures.** On full integrated annual reports the statement reader misread revenue (TCS "12") and found no equity for three of five reports in the first end-to-end run. Findings that depend on the company's own scale are therefore shown unranked when the scale looks wrong; the backtest does not depend on them.

## How to run it

1. Put each report's PDF in one folder named `case-<company>-<FY>.pdf` or `control-<company>-<FY>.pdf`.
2. Fill `docs/backtest/backtest.json` (label, event date, publication date).
3. `npm run score:notes -- <folder> --backtest docs/backtest/backtest.json --out backtest-out`
4. Commit `backtest-out/` unedited. An outside reader marks `items.csv`; `npm run score:notes -- --marked items.csv` gives precision.

## Amendments

(none)
