# Backtest expansion: the research report's 14 cases, sorted by what Sentinel can actually be tested on

**Status: a design amendment, written 2026-11-05, before any report has been run.** It adds to `PROTOCOL.md`; it changes nothing in it. The original five cases (Srei, Reliance Capital, Future Retail, Brightcom, Gensol) and their fifteen controls stand. The "flagged = at least one high finding" rule stands.

Source: *Sentinel: Analyst Workflow Research and a Ranked Roadmap* (Nov 2026), section 3, which lists 14 documented Indian cases and recommends 15 failures and about 45 controls, saying the existing 5 and 15 are "too small to say anything statistically".

## What the report's own sourcing is worth

The report says most dates and quotes come from Business Standard, PTI and similar reports of filings, **not the original PDFs**, and marks some items (†) as unchecked against the primary filing. Gensol, Brightcom and DHFL findings include interim or prima facie regulatory findings and media allegations; the report says to treat them as allegations unless final. So every row below is **press-sourced until the filing itself is read**, and a lead time quoted here is a hypothesis to check, not a result. Nothing here has been verified against a primary document.

## The finding that matters most: most of these cases cannot be tested with the readers as built

Sentinel's readers read **annual reports**, and the CARO reader targets the **CARO 2020** clause numbering (annual reports for FY2020-21 onward). Of the report's 14 cases:

| Class | Meaning | Cases | Count |
|---|---|---|---|
| **A** | Testable now with an annual-report reader, layout to be confirmed on the PDF | Kingfisher (going-concern wording in the auditors' report), Videocon (qualified opinion), Café Coffee Day (related-party balance, consolidated) | 3 |
| **In the original design** | Already in the pre-registered five | Brightcom (FY22), Gensol (FY24) | 2 |
| **B** | Needs a reader that does not exist yet | Yes Bank (RBI divergence note, a new note type), Bhushan Steel (CARO **2016** default schedule: an older order with different clause numbers) | 2 |
| **C** | An exchange or MCA event, not annual-report content; needs the watcher (roadmap rank 2) or an MCA module (rank 4) | Manpasand and Vakrangee (auditor resignations), Jet (deferred results), Byju's (late MCA filing, unlisted), DHFL (MCA director and address graph), IL&FS (group exposure; stress visible mainly in internal emails and a post-collapse audit) | 6 |
| **D** | Not a test of prevention: the signal came days before the event | Satyam (pledge disclosure about 9 days before the confession) | 1 |

**Consequence.** With the readers as built, the annual-report backtest can use the original 5 plus Kingfisher, Videocon and Café Coffee Day: **at most 8 cases**, and three of those need their layout confirmed on the PDF first. Reaching the report's target of 15 needs two new readers (the older-order CARO for Bhushan, an RBI divergence note for Yes Bank) and, for the other six, the exchange-event watcher and an MCA module, which are separate products from the notes reader. Reporting a catch rate "on 15 documented failures" before then would mix two different kinds of test.

## The case table

Lead times are the report's, from press reports; `†` = the report says it was not checked against the primary filing.

| # | Company | Signal | Where it appeared | Report's lead time | Class | What is needed to test it |
|---|---|---|---|---|---|---|
| 1 | Yes Bank | RBI divergence in gross NPA (FY16 reported 748.98 crore against 4,925.68 assessed) | FY2016-17 annual report, divergence note | about 34 months † | B | A divergence-note reader (not built); the FY2016-17 report |
| 2 | Kingfisher Airlines | Going-concern dependency on fund infusion; net worth eroded | FY2010-11 auditors' report | about 13-15 months | A (verify) | The FY2010-11 report; confirm the going-concern wording is in a heading the reader recognises |
| 3 | Manpasand Beverages | Auditor resigned citing information not provided | Exchange disclosure, 26-28 May 2018 | about 12 months | C | Auditor-event watcher (Reg 30) |
| 4 | Vakrangee | Auditor resigned citing inadequate information | Exchange disclosure, 27 Apr 2018 | weeks | C | Same watcher |
| 5 | Bhushan Steel | CARO default schedule listing lenders; cash loss 2,474 crore | FY2015-16 annual report (CARO 2016 annexure) | about 10-12 months † | B | A reader for the CARO 2016 clause (ix) layout; the FY2015-16 report |
| 6 | Videocon Industries | Qualified opinion: unable to opine on recovery of about 7,534 crore in Videocon Telecom | FY2016-17 auditors' report | 7 months or more † | A (verify) | The report; confirm the qualified-opinion heading format for that year |
| 7 | Jet Airways | Audit committee did not recommend Q1 FY19 results "pending closure of certain matters" | Exchange filing, 9 Aug 2018 | about 8 months | C | Results-deferral detector on exchange filings |
| 8 | Café Coffee Day | 842 crore due from promoter firm MACEL in consolidated FS; promoter shares heavily pledged | FY2018-19 consolidated FS (related parties); pledge data | months | A (verify) | The report; the related-party reader handles matrix tables only, so confirm the layout. The pledge half is a C item |
| 9 | Byju's (unlisted) | FY21 accounts filed about 18 months late; 1,156 crore revenue not recognised | MCA filing, 14 Sep 2022 | about 9 months | C | MCA module; not an annual-report reading |
| 10 | Gensol Engineering | Rating downgrades to D; later forged lender conduct letters | Rating actions Mar 2025; SEBI interim order 15 Apr 2025 | about 1 month | original (case 5) and C | The annual-report half is in the original design; the rating-action half needs the watcher |
| 11 | Brightcom Group | Impairment of 863.80 crore in consolidated statements with no matching standalone disclosure | FY2019-20 annual report | about 1-3 years | original (case 4) | The original case uses FY2021-22; the consolidated-versus-standalone check is a new detector |
| 12 | DHFL | Shell-borrower allegations; borrowers sharing addresses and directors | Media and MCA data, Jan 2019 | about 9 months | C | MCA director and address graph |
| 13 | IL&FS | Stress visible in internal emails from 2015; group exposure | Forensic audit after the collapse | up to about 3 years (internal) | C | Group-exposure and net-owned-fund recomputation; mostly not visible in public filings at the time |
| 14 | Satyam | Promoters' shares all pledged and being sold | Company disclosure, 29-30 Dec 2008 | about 9 days (too late) | D | Use as a negative control for lead time only |

## Controls

The rule in `PROTOCOL.md` is unchanged: for each case, the three largest listed companies in the same sector and fiscal year that had no insolvency, regulatory supersession, auditor resignation or SEBI fraud order in the following 24 months; one hard control per case. For the new cases the controls are **not named here**. They must be selected by that rule, and recorded in `backtest.json`, **before any report is run, by someone who does not see the results**; naming them now from memory would risk the same kind of error the protocol exists to prevent.

## How wide the answer will be

The Wilson 95% interval on a catch rate, at the sizes this allows:

| Cases flagged | Interval |
|---|---|
| 3 of 5 | 23% to 88% |
| 6 of 8 | 41% to 93% |
| 12 of 15 | 55% to 93% |
| 14 of 15 | 70% to 99% |

False-alarm rate on 45 controls: 0 of 45 gives 0% to 8%; 6 of 45 gives 6% to 26%. Eight cases cannot distinguish a good detector from a mediocre one. They can show it is not useless, and that is all the write-up may claim.

## What this amendment does not do

It does not run anything, choose any controls, or confirm any date. The next steps, in order: (1) obtain the PDFs for the class A cases and confirm each layout is one the reader recognises; (2) select controls for them by the rule; (3) run, commit the output unedited, and have an outside person mark `items.csv`. Building the class B readers and the exchange and MCA watchers are separate pieces of work, each with its own validation.
