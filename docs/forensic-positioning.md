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
| Filing watcher (BSE) | **Keep, for the portfolio view** | Tells you when a new report lands, and the Import page can now fetch it. Both unverified against the live feed. |
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

**Yes, for the companies you have set up as projects, and it now says how big each one is.** What exists (migration `20261113000000_sentinel_holdings.sql`, Portfolio in the sidebar):

- **A holdings list**, private to you: quantity and average cost per company, added by hand or from a broker CSV (Symbol, Company or BSE code; Quantity; Average cost or Invested value). Rows are matched by BSE code, then symbol, then company name, preferring your own project over a reference copy. A row that matches nothing, or matches two of your projects, is listed with the reason, never guessed.
- **Weights by position size.** By market value when every holding has a price, otherwise by cost, otherwise equal; the page says which, because mixing priced and unpriced positions would weight them on different scales.
- **A weighted ranking.** Each company's concern is its weight times its findings (3 points for each high, 1 for each medium, capped at 9) from the notes to its latest annual report, the auditor's report and its covenants. "Tech Mahindra - 8.0% of your book: the auditor's CARO answer on fraud is not the clean one (p.437)" is now a line in the digest, which opens with it. The score orders your reading; it is not a measure of risk.
- **Blind spots stated.** The share of the book with no annual report read is shown next to the share under a high finding, because "nothing found" is only reassuring where something was read. So is the share whose next annual report should be out by now.
- **Annual report fetch from BSE** on the Import page, by the company's BSE code or a pasted bseindia.com address. **This is not verified against the live site**: it was built and tested against a fake BSE that follows the documented response shape, because the sandbox it was built in cannot reach bseindia.com. The first real run will show whether BSE answers a cloud server, and every failure says which step failed. The file goes through the same reader as an upload and nothing is saved until you confirm the preview.

Still not there: it does not watch the whole market (only companies you have made projects), keeps no price history (a position's weight uses the latest price on the company's Settings page, flagged when it is over a week old), cannot read a holding whose report layout the note readers do not handle (those show as "not read"), and does not yet compare a note year-on-year.
