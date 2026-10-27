// Sentinel - changing the unit a project reports in. Two different things people mean by it, kept apart because
// doing the wrong one silently makes every figure 100x wrong:
//
//   relabel   "the figures are right, the unit label is wrong" (they were typed in lakh but the project said
//             crore). The numbers stay exactly as stored; only the unit changes.
//   convert   "keep the figures true, report them in another unit" (crore to lakh). Every amount on every period
//             is multiplied by the factor between the two units.
//
// Pure: the route reads the rows, asks for a plan, writes the plan, and puts the old rows back if a later step
// fails. Ratios, days and growth rates are unit-free and are never touched; only the NumericField amounts move.

import { ALL_FIELD_KEYS, type NumericField } from "./fields";
import { croreFactor, normaliseUnit, type CurrencyUnit } from "./units";
import type { FinancialStatement } from "./types";

export type UnitChangeMode = "relabel" | "convert";

export type UnitChangePlan =
  | { ok: false; error: string }
  | {
      ok: true;
      from: CurrencyUnit;
      to: CurrencyUnit;
      mode: UnitChangeMode;
      /** The full replacement rows, only for "convert" and only the ones whose figures change. */
      rows: FinancialStatement[];
      /** Statements whose figures would change; 0 for a relabel. */
      statementsChanged: number;
      /** True when a converted figure cannot be turned back into the original exactly (a plain-rupee figure
       * shown in crore keeps 12 significant digits, not every digit). */
      lossy: boolean;
    };

/** A float with the binary noise removed (0.1 + 0.2 style) but all real digits kept. */
const clean = (v: number) => Number(v.toPrecision(12));

export function planUnitChange(
  statements: FinancialStatement[],
  fromRaw: string | null | undefined,
  toRaw: unknown,
  mode: unknown
): UnitChangePlan {
  const to = typeof toRaw === "string" ? normaliseUnit(toRaw) : null;
  if (!to) return { ok: false, error: "That is not a recognised reporting unit (crore, lakh, million, thousand, billion or plain rupees)." };
  if (mode !== "relabel" && mode !== "convert") return { ok: false, error: 'mode must be "relabel" or "convert".' };
  const from = normaliseUnit(fromRaw) ?? "INR_CRORE";
  if (from === to) return { ok: false, error: "The project already reports in that unit." };

  if (mode === "relabel") return { ok: true, from, to, mode, rows: [], statementsChanged: 0, lossy: false };

  const factor = croreFactor(from) / croreFactor(to); // new-unit amount = old-unit amount x factor
  let lossy = false;
  const rows: FinancialStatement[] = [];
  for (const s of statements) {
    const next = { ...s } as FinancialStatement & Record<NumericField, number | null>;
    let touched = false;
    for (const key of ALL_FIELD_KEYS) {
      const v = s[key];
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      const converted = clean(v * factor);
      if (!Number.isFinite(converted)) return { ok: false, error: `${key} on ${s.period_label} is too large to convert.` };
      if (clean(converted / factor) !== v) lossy = true;
      next[key] = converted;
      touched = true;
    }
    if (touched) rows.push(next);
  }
  return { ok: true, from, to, mode, rows, statementsChanged: rows.length, lossy };
}
