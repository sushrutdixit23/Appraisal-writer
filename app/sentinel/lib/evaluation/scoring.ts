// Sentinel evaluation - scoring. Ported from the Python prototype's evaluation/scoring.py: the
// same mutually-exclusive outcomes, the same headline (abstained items are not correct;
// coverage and precision-on-accepted are reported alongside so accuracy cannot be inflated by
// dropping hard items), the same two kinds of interval (Wilson per group, a bootstrap that
// resamples whole filings since items in one filing are not independent).
//
// Two things this app's pipeline does not have, which change how classify() and summarize()
// read below:
//   - No abstain status on a field. The model always returns its best value; the route
//     separately flags a field it could not verify (low_confidence_fields). "abstained" here
//     is read off that flag only when it accompanies NO value at all - the pipeline saw the
//     field and said "I can't tell", rather than silently producing nothing (missed).
//   - No cost/latency instrumentation. The Python version's cost_latency() is not ported - this
//     app does not record per-run token cost or wall time anywhere today, and fabricating it
//     here would be worse than leaving it out. Add it once the route logs usage.

import { toCrore } from "../units";
import { scoredItems } from "./groundTruth";
import {
  OUTCOMES,
  type GroundTruth,
  type GroundTruthItem,
  type ItemRecord,
  type Outcome,
  type Prediction,
  type Summary,
} from "./types";

export const TARGETS = { T1_precision_accepted: 0.98, T2_coverage: 0.8 };

/** Wilson score interval for k successes out of n, at the given z (1.96 = 95%). null when
 * there is nothing to estimate from. */
export function wilson(k: number, n: number, z = 1.96): [number, number] | null {
  if (n === 0) return null;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(centre - margin) / denom, (centre + margin) / denom];
}

/** Nearest-rank percentile (so percentile(xs, 50) is a real element of xs, not an average). */
export function percentile(values: number[], pct: number): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((pct / 100) * ordered.length));
  return ordered[rank - 1];
}

function firstRunByFiling(predictions: Prediction[]): Map<string, Prediction> {
  const first = new Map<string, Prediction>();
  for (const p of predictions) if (!first.has(p.filing_id)) first.set(p.filing_id, p);
  return first;
}

const CRORE_EPSILON = (a: number, b: number) => Math.abs(a - b) < Math.max(1e-6, Math.abs(b) * 1e-6);

/** One item's outcome: correct, wrong_value, wrong_citation, missed, invented or abstained -
 * see the file header for how "abstained" and "wrong_citation" read this app's own shapes. */
export function classify(item: GroundTruthItem, pred: Prediction | null | undefined): Outcome {
  const truth = item.adjudication.truth;
  if (!pred) return "missed";

  const value = pred.fields[item.field];
  const flagged = pred.low_confidence_fields.includes(item.field);
  if (value == null) {
    if (truth.is_absent) return "correct";
    return flagged ? "abstained" : "missed"; // a flagged gap is an honest "I can't tell"; a silent one is a miss
  }
  if (truth.is_absent) return "invented";

  const truthCrore = truth.value != null && truth.unit ? toCrore(truth.value, truth.unit) : null;
  const predCrore = toCrore(value, pred.unit);
  if (truthCrore == null || !CRORE_EPSILON(predCrore, truthCrore)) return "wrong_value";

  const flags = pred.grounding[item.field] ?? [];
  const pageOk = truth.pdf_page == null || pred.pages_used.includes(truth.pdf_page);
  if (flags.length > 0 || !pageOk) return "wrong_citation";
  return "correct";
}

/** Was the item's true page among the pages the model read? null when the item has no true
 * page (truth is absent), so absent items never count for or against this. */
function located(item: GroundTruthItem, pred: Prediction | null | undefined): boolean | null {
  const truthPage = item.adjudication.truth.pdf_page;
  if (truthPage == null) return null;
  if (!pred) return false;
  return pred.pages_used.includes(truthPage);
}

export function itemRecords(gt: GroundTruth, predictions: Prediction[]): ItemRecord[] {
  const first = firstRunByFiling(predictions);
  const companies = new Map(gt.filings.map((f) => [f.filing_id, f.company_id]));
  return scoredItems(gt).map((item) => {
    const pred = first.get(item.filing_id);
    return {
      item_id: item.item_id,
      filing_id: item.filing_id,
      company_id: companies.get(item.filing_id) ?? "unknown",
      split: item.split,
      item_class: item.item_class ?? "unclassified",
      truth_absent: item.adjudication.truth.is_absent,
      outcome: classify(item, pred),
      located: located(item, pred),
    };
  });
}

export function summarize(records: ItemRecord[]): Summary {
  const n = records.length;
  const counts = Object.fromEntries(OUTCOMES.map((o) => [o, records.filter((r) => r.outcome === o).length])) as Record<Outcome, number>;
  const accepted = n - counts.abstained;
  const absent = records.filter((r) => r.truth_absent);
  const valueCorrect = counts.correct + counts.wrong_citation;
  const withPage = records.filter((r) => r.located != null);
  return {
    n,
    counts,
    cited_accuracy: n ? counts.correct / n : null,
    cited_accuracy_ci95: wilson(counts.correct, n),
    value_accuracy: n ? valueCorrect / n : null,
    coverage: n ? accepted / n : null,
    precision_accepted: accepted ? counts.correct / accepted : null,
    null_accuracy: absent.length ? absent.filter((r) => r.outcome === "correct").length / absent.length : null,
    null_n: absent.length,
    invented: counts.invented,
    locate_accuracy: withPage.length ? withPage.filter((r) => r.located).length / withPage.length : null,
  };
}

/** A small seedable PRNG (mulberry32) so a bootstrap run is reproducible - not Python's
 * random.Random, just as deterministic for a given seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 95% interval of cited accuracy, resampling whole filings (items in a filing correlate, so
 * resampling items directly would understate the true uncertainty). null with fewer than two
 * filings - there is nothing to resample. */
export function bootstrapByFiling(records: ItemRecord[], iterations = 2000, seed = 0): [number, number] | null {
  const byFiling = new Map<string, ItemRecord[]>();
  for (const r of records) {
    const list = byFiling.get(r.filing_id);
    if (list) list.push(r);
    else byFiling.set(r.filing_id, [r]);
  }
  const filings = [...byFiling.keys()];
  if (filings.length < 2) return null;
  const rand = mulberry32(seed);
  const stats: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const sample: ItemRecord[] = [];
    for (let j = 0; j < filings.length; j++) sample.push(...byFiling.get(filings[Math.floor(rand() * filings.length)])!);
    stats.push(sample.filter((r) => r.outcome === "correct").length / sample.length);
  }
  return [percentile(stats, 2.5)!, percentile(stats, 97.5)!];
}

export function checkTargets(testRecords: ItemRecord[], allRecords: ItemRecord[]): Record<string, { value: number | null; passed: boolean }> {
  const s = summarize(testRecords);
  const filingOk = new Map<string, boolean>();
  for (const r of allRecords) {
    if (r.located == null) continue; // an absent item has no true page to locate
    filingOk.set(r.filing_id, (filingOk.get(r.filing_id) ?? true) && r.located);
  }
  const flags = [...filingOk.values()];
  return {
    T1_precision_accepted: { value: s.precision_accepted, passed: s.precision_accepted != null && s.precision_accepted >= TARGETS.T1_precision_accepted },
    T2_coverage: { value: s.coverage, passed: s.coverage != null && s.coverage >= TARGETS.T2_coverage },
    T3_no_invented_values: { value: s.invented, passed: s.n > 0 && s.invented === 0 },
    T4_all_filings_located: { value: flags.filter(Boolean).length, passed: flags.length > 0 && flags.every(Boolean) },
  };
}

export type ScoreReport = {
  groups: Record<"all" | "test" | "dev", Summary>;
  by_company: Record<string, Summary>;
  by_class: Record<string, Summary>;
  targets_on_test: Record<string, { value: number | null; passed: boolean }>;
  records: ItemRecord[];
};

export function score(gt: GroundTruth, predictions: Prediction[]): ScoreReport {
  const records = itemRecords(gt, predictions);
  const groups = {
    all: { ...summarize(records), bootstrap_by_filing_ci95: bootstrapByFiling(records) },
    test: { ...summarize(records.filter((r) => r.split === "test")), bootstrap_by_filing_ci95: bootstrapByFiling(records.filter((r) => r.split === "test")) },
    dev: { ...summarize(records.filter((r) => r.split === "dev")), bootstrap_by_filing_ci95: bootstrapByFiling(records.filter((r) => r.split === "dev")) },
  };
  const byCompany: Record<string, Summary> = {};
  for (const c of new Set(records.map((r) => r.company_id))) byCompany[c] = summarize(records.filter((r) => r.company_id === c));
  const byClass: Record<string, Summary> = {};
  for (const k of new Set(records.map((r) => r.item_class))) byClass[k] = summarize(records.filter((r) => r.item_class === k));
  return {
    groups,
    by_company: byCompany,
    by_class: byClass,
    targets_on_test: checkTargets(records.filter((r) => r.split === "test"), records),
    records,
  };
}
