# Sentinel as a forensic reader: what to keep, hide and drop

**Positioning in one line:** *Sentinel reads the notes nobody reads, and shows its work.* A forensic reader for Indian financial statements: every flag traced to its page, every number checked in code.

**Who it is for:** first, credit analysts at banks and NBFCs appraising borrowers (most are unlisted, so no database covers them); second, equity analysts who want a forensic layer on companies they already cover.

**The test for every feature:** does it help someone *find what is wrong in a filing and prove it from the page*? If not, it hides or goes.

## Verdicts (recommendations only; nothing has been removed)

| Feature | Verdict | Why |
|---|---|---|
| Import files (PDF, CSV, Excel, XBRL, scanned-PDF OCR, large-file upload) | **Keep, front and centre** | Ingestion is the door. Point the PDF path at the statement pages (see the scorecard: figures read from a whole 400-page report are 58-65% right). |
| Data requests / the CA upload link, trial-balance import | **Keep** | The lender workflow: borrowers send files, the analyst reviews. This is how unlisted companies get in. |
| **Notes to the accounts** (ageing, CARO, ratios, contingent, maturity, related parties) | **Keep: this is the product** | The only feature no free database has. Extend before adding anything else. |
| Auditor's report checks and Key Audit Matters | **Keep** | Same job, same philosophy. |
| KPIs: Piotroski F, Altman Z, Beneish M, credit ratios | **Keep** | Forensic scores, each with its formula shown. |
| Statements, Edit periods, source and change history | **Keep** | The audit trail behind every figure. |
| Investigations (anomaly flags + AI narrative + approve/reject) | **Keep, simplify** | The flags are the point. The narrative is useful only because every figure in it is checked against the data; keep that check, drop the approve/reject ceremony until a team uses it. |
| Coverage digest | **Keep** | The morning view: what needs attention across your companies. |
| Peers and trends, peer benchmarking, sector pattern detection | **Keep as supporting evidence** | "This flag is up across the sector" is forensic context. Demote from the main nav. |
| Covenant tracker | **Keep for the lender persona** | A credit analyst's tool; irrelevant to an equity reader. Show it only for projects marked as a loan. |
| Filing watcher (BSE) | **Keep, for the portfolio view** | Tells you when a new report lands. Unverified against the live feed. |
| Results brief (quarterly), results calendar | **Hide behind "More"** | Results-day tooling for equity analysts. Good, but it is a different product from the forensic reader. |
| Estimates and variance | **Hide** | Needs a consensus feed Sentinel does not have; a typed number is not a street estimate. |
| Concall / transcript reader | **Hide** | A model reads it (checked by quote), so it is the one place the philosophy bends. Useful, unverified on real calls, and not forensic of statements. |
| Draft earnings note (.docx) | **Hide** | A results-day deliverable. Replace with a **forensic memo**: the findings with their pages, ready to send. |
| Peer valuation, football field, P/E, EV/EBITDA, market price entry, live price feed | **Drop from the main flow** | Valuation is where Screener and Bloomberg win and where Sentinel has no edge. The one exception: show no valuation at all rather than a stale one. |
| Board deck (PPTX), MIS pack (PDF) | **Drop** | Presentation formats for a different buyer. Keep the Excel export: analysts live in Excel. |
| Operating metrics (attrition, utilisation, headcount, order book) | **Hide** | Manual entry of non-forensic KPIs. |
| Confidence calibration | **Hide until there is data** | It needs a quarter of real approve/reject decisions to mean anything. Showing an empty calibration page costs credibility. |
| Decision memory | **Keep, quietly** | "We already answered this flag last year" is a real saving once there are users. Invisible until then. |
| Executive dashboard | **Hide** | Management reporting, not forensics. |
| Tally agent | **Drop** | Nobody in the user's circle uses Tally; unverified; a distraction. |
| Review cycles, recommendation engine (priority, owner, timeline) | **Hide** | Workflow for a team that does not exist yet. |
| Discussion threads and reviewer links | **Keep, small** | One analyst sending a colleague one finding to comment on is the entire collaboration a pilot needs. |

## What to build next, in this order

1. **A forensic memo**: one page per company, findings ranked, each with its page and quote, exportable. It replaces the earnings note and is what a credit analyst attaches to a file.
2. **Year-on-year change in the notes.** The notes are now stored per year, so the question "what changed in the CARO answers, the ageing tail, the related-party loans since last year" is cheap to answer and is the sharpest forensic question there is.
3. **NBFC notes**: stage-3 assets, the asset-liability maturity statement, capital adequacy. Two of the five backtest cases are NBFCs and the reader is currently blind to what matters for them.
4. **Fix statement extraction on full annual reports** (scorecard: 58-65%).
5. **The outside check** of `items.csv` and the **backtest** (`docs/backtest/PROTOCOL.md`), then publish both.

## Will Sentinel highlight your portfolio?

**Partly, and not the way you probably mean.** Today:

- It can show, for the companies you have set up as projects, which ones have something that needs attention: the coverage digest ranks flags, notes findings, overdue filings and covenant problems across your own companies.
- It cannot take a list of holdings with quantities and prices, rank findings by position size, or watch the whole market for you. There is no holdings table, no price history, and the filing watcher is unverified against the live BSE feed.
- Every company still needs its annual report put in by hand (or by a CA through the upload link).

To make it a real portfolio view you need four things, none large: a holdings list (symbol, quantity, cost); a weight-aware digest ("Tech Mahindra is 8% of your book and its auditor filed a fraud report under section 143(12)"); automatic fetch of each new annual report from BSE/NSE; and the year-on-year notes comparison above. The first two are about two days of work. The third depends on the exchange feed being reachable, which it is not from where Sentinel was built.
