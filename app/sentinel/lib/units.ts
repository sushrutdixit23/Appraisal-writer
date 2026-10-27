// Sentinel - reporting units. Companies report in rupees, thousands, lakh,
// million, crore or billion. Everything that compares companies in
// absolute terms (peer rank by revenue, "closest peer by scale", gap in
// crore, trend overlays) first converts to crore, so a company entered in
// lakh is never ranked against one entered in crore as if the numbers
// were the same unit. Ratios do not depend on the unit and are untouched.

export type CurrencyUnit =
  | "INR"
  | "INR_THOUSAND"
  | "INR_LAKH"
  | "INR_MILLION"
  | "INR_CRORE"
  | "INR_BILLION";

export const UNIT_OPTIONS: { value: CurrencyUnit; label: string; crore: number }[] = [
  { value: "INR_CRORE", label: "₹ Crore", crore: 1 },
  { value: "INR_LAKH", label: "₹ Lakh", crore: 0.01 },
  { value: "INR_MILLION", label: "₹ Million", crore: 0.1 },
  { value: "INR_THOUSAND", label: "₹ Thousand", crore: 0.0001 },
  { value: "INR_BILLION", label: "₹ Billion", crore: 100 },
  { value: "INR", label: "₹ (plain rupees)", crore: 1e-7 },
];

const CRORE_PER_UNIT: Record<CurrencyUnit, number> = Object.fromEntries(
  UNIT_OPTIONS.map((u) => [u.value, u.crore])
) as Record<CurrencyUnit, number>;

// Every spelling seen in the database and in filings, lower-cased with
// punctuation and the rupee sign stripped.
const ALIASES: Record<string, CurrencyUnit> = {
  cr: "INR_CRORE",
  crore: "INR_CRORE",
  crores: "INR_CRORE",
  inr_crore: "INR_CRORE",
  inrcrore: "INR_CRORE",
  lakh: "INR_LAKH",
  lakhs: "INR_LAKH",
  lac: "INR_LAKH",
  lacs: "INR_LAKH",
  inr_lakh: "INR_LAKH",
  inrlakh: "INR_LAKH",
  million: "INR_MILLION",
  millions: "INR_MILLION",
  mn: "INR_MILLION",
  mm: "INR_MILLION",
  inr_million: "INR_MILLION",
  inrmillion: "INR_MILLION",
  thousand: "INR_THOUSAND",
  thousands: "INR_THOUSAND",
  inr_thousand: "INR_THOUSAND",
  inrthousand: "INR_THOUSAND",
  billion: "INR_BILLION",
  billions: "INR_BILLION",
  bn: "INR_BILLION",
  inr_billion: "INR_BILLION",
  inrbillion: "INR_BILLION",
  inr: "INR",
  rs: "INR",
  rupee: "INR",
  rupees: "INR",
};

/** Canonical unit for any spelling, or null if it is not recognised. */
export function normaliseUnit(raw: string | null | undefined): CurrencyUnit | null {
  if (!raw) return null;
  const cleaned = raw
    .toLowerCase()
    .replace(/₹/g, "")
    .replace(/[\s.\-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!cleaned) return null;
  return ALIASES[cleaned] ?? ALIASES[cleaned.replace(/_/g, "")] ?? null;
}

/** Crore per one reporting unit. An unrecognised or missing unit is read
 * as crore, which is what every figure on file was entered in before
 * units were tracked. */
export function croreFactor(raw: string | null | undefined): number {
  const unit = normaliseUnit(raw);
  return unit ? CRORE_PER_UNIT[unit] : 1;
}

export function toCrore(value: number, rawUnit: string | null | undefined): number {
  return value * croreFactor(rawUnit);
}

const SHORT: Record<CurrencyUnit, string> = {
  INR_CRORE: "cr",
  INR_LAKH: "lakh",
  INR_MILLION: "mn",
  INR_THOUSAND: "k",
  INR_BILLION: "bn",
  INR: "",
};

/** "\u20b91,234.5 cr" style amount in the company's own reporting unit. */
export function formatMoney(value: number, rawUnit: string | null | undefined): string {
  const unit = normaliseUnit(rawUnit) ?? "INR_CRORE";
  const text = value.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `\u20b9${text}${SHORT[unit] ? " " + SHORT[unit] : ""}`;
}

export function unitLabel(raw: string | null | undefined): string {
  const unit = normaliseUnit(raw);
  return unit ? UNIT_OPTIONS.find((u) => u.value === unit)!.label : "₹ crore";
}

/** Convert an amount between two reporting units, rounded to remove
 * binary-float noise (0.1 + 0.2 style) without losing real precision. */
export function convertAmount(value: number, from: CurrencyUnit, to: CurrencyUnit): number {
  const raw = (value * CRORE_PER_UNIT[from]) / CRORE_PER_UNIT[to];
  return Math.round(raw * 1e6) / 1e6;
}

export type UnitDetection = {
  unit: CurrencyUnit;
  evidence: string;
  /** True when a second, different unit is mentioned about as often. */
  ambiguous: boolean;
};

const CURRENCY = String.raw`(?:₹|rs\.?|inr|indian\s+rupees?|rupees?)`;
const UNIT_WORD = String.raw`(crores?|cr\b\.?|lakhs?|lacs?|millions?|mn\b|thousands?|billions?|bn\b)`;
const UNIT_PATTERNS = [
  new RegExp(String.raw`${CURRENCY}\s*(?:\(?\s*in\s+)?${UNIT_WORD}`, "gi"),
  new RegExp(String.raw`\bin\s+(?:${CURRENCY}\s*)?${UNIT_WORD}`, "gi"),
];

/** Read the unit a statement page states about itself, e.g. "(₹ in crore)",
 * "(Rs. in lakhs)" or "All amounts in ₹ million". Counted per unit across
 * the text given; the caller should pass only the statement pages, not the
 * whole report, so narrative mentions elsewhere cannot outvote the table
 * header. */
export function detectUnitInText(text: string): UnitDetection | null {
  const counts = new Map<CurrencyUnit, { n: number; evidence: string }>();
  for (const pattern of UNIT_PATTERNS) {
    for (const m of text.matchAll(pattern)) {
      const unit = normaliseUnit(m[1].replace(/\.$/, ""));
      if (!unit) continue;
      const entry = counts.get(unit) ?? { n: 0, evidence: m[0].replace(/\s+/g, " ").trim() };
      entry.n += 1;
      counts.set(unit, entry);
    }
  }
  if (counts.size === 0) return null;
  const ranked = [...counts.entries()].sort((a, b) => b[1].n - a[1].n);
  const [unit, top] = ranked[0];
  const second = ranked[1]?.[1].n ?? 0;
  return { unit, evidence: top.evidence, ambiguous: second > 0 && second >= top.n * 0.5 };
}
