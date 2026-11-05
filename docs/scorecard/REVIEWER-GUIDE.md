# Reviewer guide: marking Sentinel's findings against the PDFs

**Why this exists.** Sentinel reads annual reports and extracts items (a receivables table, an auditor's answer, a related-party row) each with the page it came from. The author has checked that numbers add up. Nobody outside the project has yet checked whether the items are **right**, which is the number a bank or a fund needs before trusting a red flag. This guide is for the person who does that, and who is not the author.

**Who should do it.** A credit analyst, chartered accountant, forensic accountant or equity analyst who has read Indian annual reports, has not worked on Sentinel, and is willing to say "wrong". Ideally two such people: the second marks a smaller overlap so the agreement between you can be measured.

## What you receive

`reviewer-A.csv` (about 100 rows, a random sample drawn with a published seed, every kind of item represented). If you are the second reviewer, `reviewer-B.csv` (the 30 rows that both of you mark). Each row:

| Column | Meaning |
|---|---|
| `file` | Which annual report (the PDF is separately supplied) |
| `reader` | What kind of item: `ageing`, `ratios`, `caro`, `contingent`, `maturity`, `related_parties`, or `finding` |
| `page` | The **PDF page number** (the number your PDF viewer shows, not the number printed on the page) |
| `what`, `values` | What Sentinel says it found, and the figures it read |
| `source_text` | The text on that page it read it from |
| `verdict (right / wrong / partly)` | **You fill this in** |
| `checker_notes` | Optional: anything useful, especially why you marked wrong |

Do not look at Sentinel's code or its severity labels while marking. You are judging the extraction against the page, not the thresholds.

## How to mark

Open the PDF at `page`. Read what is printed. Then:

| `reader` | **right** | **partly** | **wrong** |
|---|---|---|---|
| `ageing` | It is a trade-receivables ageing table for the year stated, and the gross, allowance and over-one-year figures match the page | The table is right but one figure is off or a row is mis-bucketed | It is not a receivables ageing table, is the wrong year, or the figures do not match |
| `ratios` | The ratio's name, current-year and previous-year figures match the company's ratio table | Name and one year right, the other year wrong | The ratio is not in the table, or both years are wrong |
| `caro` | The clause number and its status (clean or adverse) match what the auditor wrote | The clause is right but the status is arguable | Wrong clause, or a clean answer marked adverse (or the reverse) |
| `contingent` | The amount, its year and what it is about match the sentence or table | Amount right, subject or year off | Not a contingent liability, or the amount is wrong |
| `maturity` | The row is a borrowings (or lease or payables) maturity row and its buckets and total match the table | Buckets right, label arguable | Not a maturity row, or the buckets are wrong |
| `related_parties` | The row is a related-party transaction row and its columns and total match the table | Row right, label arguable | Not a related-party table, or the figures are wrong |
| `finding` | The statement Sentinel makes is **true of the page** (for example, "8.5% of receivables is over a year past due" and the page supports that figure) | True in substance but a figure is off | The statement is not supported by the page |

Rules for the awkward cases:
- **Judge the claim, not the importance.** An item can be right and uninteresting. "Right" means "what Sentinel says is on this page is what Sentinel says it is".
- **Unsure?** Mark `partly` and say why in `checker_notes`. Do not leave it blank, and do not guess `right`.
- **The page does not contain the item at all?** Mark `wrong`, and note whether it is on a neighbouring page (a page-reference error is a different failure from a misread figure).
- **A figure is right but Sentinel mislabelled the year or basis (standalone or consolidated)?** `partly`.

The author estimates 100 rows take one to two hours. That is an estimate, not a measurement; tell us how long it really took.

## What happens next

1. Send back the marked CSV (keep the columns unchanged; Excel or any spreadsheet is fine).
2. `npm run score:notes -- --marked reviewer-A-marked.csv` prints **precision per reader with a 95% interval**.
3. If two people marked the overlap: `npm run review:sample -- --agreement reviewer-A-marked.csv reviewer-B-marked.csv` prints the raw agreement, Cohen's kappa, and the items you marked differently. Where you disagree, the definition above is probably unclear, and that is worth fixing before the number is published.
4. The results are published as they stand, together with the reviewer's role (not name unless they agree) and how many rows they marked. A weak result is as publishable as a strong one; that is the point.

## What this does not measure

- **Recall**: what Sentinel missed. Marking its output cannot find what it never extracted. Recall needs someone to list, for a few reports, every receivables table, CARO clause and related-party matrix, and then compare. That is a separate exercise.
- **Whether the thresholds are sensible** (for example 15% of receivables over a year as "high"). Those are starting assumptions, not under test here.
- **Reports outside the first five** (TCS, Infosys, HCLTech, Wipro, Tech Mahindra, FY26), which the author chose.

## Producing the pack

```bash
npm run review:sample -- docs/scorecard/run-2026-10-30/items.csv --n 100 --overlap 30 --seed 20261105 --out review-pack
```

The seed is fixed and published, so anyone can redraw the same sample from the same sheet, and nobody can be accused of picking the easy rows. A different seed gives a different valid sample; if the first result is weak, do not redraw until it improves.
