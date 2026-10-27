// Sentinel - the display unit, the pure part (no React): how rupee amounts are SHOWN, whatever unit they are stored
// in. The server routes use it for the exports; the pages use it through useDisplayUnit (displayUnit.ts).
//
//   as reported   a company's own figures in its own unit; comparisons across companies in crore (the default)
//   crore / lakh / million   everything converted to that unit

import { croreFactor, normaliseUnit, unitLabel, type CurrencyUnit } from "./units";

export type DisplayUnit = "as_reported" | "INR_CRORE" | "INR_LAKH" | "INR_MILLION";

export const DISPLAY_UNITS: { value: DisplayUnit; label: string; short: string }[] = [
  { value: "as_reported", label: "As reported", short: "As reported" },
  { value: "INR_CRORE", label: "\u20b9 Crore", short: "Cr" },
  { value: "INR_LAKH", label: "\u20b9 Lakh", short: "Lakh" },
  { value: "INR_MILLION", label: "\u20b9 Million", short: "Mn" },
];

export function parseDisplayUnit(raw: unknown): DisplayUnit {
  return DISPLAY_UNITS.some((u) => u.value === raw) ? (raw as DisplayUnit) : "as_reported";
}

export type DisplayFormat = {
  unit: DisplayUnit;
  /** A peer-table figure (held in crore) in the display unit. */
  fromCrore: (v: number) => number;
  /** A company's own statement figure (held in its reporting unit) in the display unit. */
  fromCompany: (v: number, companyUnit: string | null | undefined) => number;
  /** "\u20b9 crore", "\u20b9 lakh"... for cross-company figures. */
  crossLabel: string;
  /** The label for a company's own figures. */
  ownLabel: (companyUnit: string | null | undefined) => string;
  /** Short suffix for inline amounts: "cr", "lakh", "mn". */
  crossShort: string;
  /** Short suffix for a company's own amounts. */
  ownShort: (companyUnit: string | null | undefined) => string;
};

const shortOf = (u: CurrencyUnit | null) =>
  u === "INR_LAKH" ? "lakh" : u === "INR_MILLION" ? "mn" : u === "INR_THOUSAND" ? "k" : u === "INR_BILLION" ? "bn" : u === "INR" ? "" : "cr";

/** The conversions for a display unit. */
export function displayFormat(unit: DisplayUnit): DisplayFormat {
  const target: CurrencyUnit | null = unit === "as_reported" ? null : (normaliseUnit(unit) as CurrencyUnit);
  const targetFactor = target ? croreFactor(target) : null; // crore per one display unit
  return {
    unit,
    fromCrore: (v) => (targetFactor ? v / targetFactor : v),
    fromCompany: (v, companyUnit) => (targetFactor ? (v * croreFactor(companyUnit)) / targetFactor : v),
    crossLabel: target ? unitLabel(target) : "\u20b9 crore",
    ownLabel: (companyUnit) => (target ? unitLabel(target) : unitLabel(companyUnit)),
    crossShort: shortOf(target),
    ownShort: (companyUnit) => shortOf(target ?? normaliseUnit(companyUnit)),
  };
}
