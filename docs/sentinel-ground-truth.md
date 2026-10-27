# Document Intelligence evaluation

Scores a batch of `/api/sentinel/extract` runs against a hand-labelled ground-truth file. Ported
from the Python prototype's `evaluation/scoring.py` and `evaluation/ground_truth.py` - same
outcome taxonomy, same two kinds of interval, same pre-registered targets - adapted to this app's
own extraction shape rather than the prototype's `IngestResult` pipeline. The library lives in
`app/sentinel/lib/evaluation/` (`types.ts`, `groundTruth.ts`, `scoring.ts`), all pure and tested
in `tests/sentinel/evaluation.test.ts`; the CLI is `scripts/score-extraction.ts`.

## Why this exists

`checkDraft` and `checkGrounding` (see `extraction.ts`) run on every extraction and flag fields
for a person to verify - they tell you *this run* might have a problem. They cannot tell you
*how often* the pipeline is right, which matters before trusting it on a company you have not
checked by hand, and before changing the prompt or the model and wanting to know if that made
things better or worse. That needs a labelled sample and a score run over it, not a review of
one filing at a time.

## Ground-truth file

A JSON object: `{ held_out_company, filings: Filing[], items: GroundTruthItem[] }`.

**Filing** - one row per filing you have labelled: `{ filing_id, company_id, page_count }`.
`filing_id` is yours to choose; use one per filing **and period** (e.g. `"acme-fy26"`), since a
prediction is scored against exactly the extraction run for that filing_id - there is no separate
"which period" field the way the prototype had `period_column`, because this app's extraction
route always targets the single most recent period in one call (system prompt rule 2 in
`extraction.ts`). To grade a comparative column too, label it as its own filing_id.

**GroundTruthItem** - one field, on one filing, that at least two people have independently
read off the page and agreed (or a third person resolved a disagreement):

```jsonc
{
  "item_id": "acme-fy26-revenue_from_operations",   // unique across the whole file
  "filing_id": "acme-fy26",
  "field": "revenue_from_operations",                // any key from fields.ts's ALL_FIELD_KEYS
  "basis": "consolidated",                            // "standalone" | "consolidated"
  "split": "test",                                    // see held_out_company, below
  "item_class": "stated",                              // optional; see CLASSES below
  "adjudication": {
    "status": "agree",                                 // "agree" | "resolved" | "pending" | "disputed"
    "reason": null,                                     // required when status is "resolved"
    "annotations": 2,                                   // how many people labelled it; >= 2 to be scored
    "truth": {
      "is_absent": false,
      "value": 1000,                                    // null iff is_absent
      "unit": "INR_CRORE",                               // a CurrencyUnit; required unless is_absent
      "pdf_page": 5                                      // the page it is printed on, or null if unknown
    }
  }
}
```

Only items whose `adjudication.status` is `"agree"` or `"resolved"` are scored (`SCORED_STATUSES`
in `groundTruth.ts`) - `"pending"` and `"disputed"` sit in the file without affecting the numbers
until someone finishes labelling them.

**`held_out_company`** names the one company whose filings are never looked at while building or
tuning the pipeline. Every item on one of its filings must have `split: "test"`; every other
item must have `split: "dev"`. `validateGroundTruth` checks this, so a mislabelled split cannot
quietly inflate the headline number that is supposed to be held out.

**`item_class`** (optional, free-form grouping for `by_class` in the report) is one of: `stated`,
`unit_converted`, `bracketed_negative`, `nil_dash`, `previous_year_column`,
`restated_comparative`, `multi_page`, `absent`. `nil_dash` implies a truth value of `0`; `absent`
implies `is_absent: true`.

Validate a file before trusting it:

```ts
import { validateGroundTruth } from "app/sentinel/lib/evaluation/groundTruth";
const errors = validateGroundTruth(groundTruth); // [] means fit to score
```

The CLI runs this first and refuses to score a file that fails it.

### What the Python version had that this one does not

- **`value_as_printed`** (the literal printed string, separate from the parsed number) - dropped.
  This app's own grounding check (`checkGrounding` in `extraction.ts`) already verifies the
  model's cited quote carries the value; a second printed-string field here would duplicate that
  without adding anything `classify()` uses.
- **`statement`** (always `"profit_and_loss"` in the prototype, since balance sheet and cash flow
  were not yet covered) - dropped; this app's `ALL_FIELD_KEYS` already spans all three
  statements, so every field is eligible without a redundant tag.
- **Multiple candidate page sets per basis** (the prototype's own retrieval stage) - there is
  nothing to port; `selectStatementPages` already picks one page set before the model runs, and
  `located()` below checks the truth page against that one set (`pages_used`).

## Predictions

What one extraction run is scored against - built by the **caller**, not returned by the route
as-is, because two pieces (`grounding`, `pages_used`) are not on the route's JSON response today:

```ts
type Prediction = {
  filing_id: string;                                    // matches a GroundTruthItem.filing_id
  fields: Partial<Record<NumericField, number>>;         // ExtractionResult.fields, unchanged
  low_confidence_fields: NumericField[];                  // ExtractionResult.low_confidence_fields
  grounding: Partial<Record<NumericField, GroundingFlag[]>>; // from checkGrounding() on that run
  unit: CurrencyUnit | null;                              // ExtractionResult.unit
  pages_used: number[];                                   // ExtractionResult.pages_used
};
```

Save these to a `predictions.json` (an array, one per filing_id) once you have run the route over
your labelled filings - either by calling the route directly in a small script, or by extending
it to log this shape to a file, whichever is less to maintain for the size of the eval set you
run.

## Outcomes

Every scored item gets exactly one, read by `classify()`:

| Outcome | When |
| --- | --- |
| `correct` | Truth is absent and the prediction gives no value; or the value matches (after unit conversion), its cited row has no grounding flag, and the page the model read includes the truth's page. |
| `wrong_value` | The prediction has a value, but it does not match truth once both are converted to crore. |
| `wrong_citation` | The value is right, but `checkGrounding` flagged the field, or the model was not shown the page truth cites. A number that happens to be right for the wrong reason. |
| `missed` | No run at all for this filing, or the run gave no value and did not flag the field either - a silent gap. |
| `invented` | Truth says the field is absent from the filing, but the run supplied a value anyway. |
| `abstained` | The run gave no value **and** flagged the field as low-confidence - an honest "I can't tell" rather than a silent miss. (This app's pipeline never withholds a value outright the way the prototype's could; this is the nearest real analogue - see the comment at the top of `scoring.ts`.) |

## Reading the report

`score(groundTruth, predictions)` returns:

- **`groups.all` / `.test` / `.dev`** - a `Summary` per split, each with a bootstrap-by-filing
  95% CI added (resampling whole filings, since items in one filing are not independent draws).
- **`by_company`**, **`by_class`** - the same `Summary` sliced by company_id and item_class.
- **`targets_on_test`** - the four pre-registered checks, evaluated on the test split only:

  | Target | Passes when |
  | --- | --- |
  | `T1_precision_accepted` | precision on accepted (non-abstained) items ≥ 0.98 |
  | `T2_coverage` | share of items not abstained ≥ 0.80 |
  | `T3_no_invented_values` | zero `invented` outcomes |
  | `T4_all_filings_located` | every filing's true page was among the pages the model read, for every item that has a true page |

- **`records`** - one row per scored item, for drilling into specific failures.

A `Summary`'s `cited_accuracy` is `correct / n` (abstained items count against it, so the headline
cannot be inflated by abstaining on hard items); `precision_accepted` is `correct / (n - abstained)`,
reported alongside so the two together tell the whole story. `value_accuracy` additionally
credits `wrong_citation` (the number itself was right).

## Running it

```sh
npm run score:extraction -- ground-truth.json predictions.json
```

Prints the report above and exits `1` if the ground-truth file fails validation, or if any of
T1-T4 fails on the test split - so this can gate a CI job once a labelled set exists. There is no
sample data checked in; build `ground-truth.json` by hand-labelling a few filings (at least two
people per item, a third to resolve disagreements) and `predictions.json` by running the real
route over those same filings and saving the shape above.
