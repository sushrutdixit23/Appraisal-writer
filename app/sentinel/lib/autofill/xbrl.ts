// Sentinel autofill - an XBRL instance document, the structured file the exchanges publish alongside a company's financial results. Unlike a
// PDF there is nothing to guess at: every figure is a tagged fact with a context that names its period, so this reads periods from the
// contexts' own dates and figures from the tag names, then hands the lines to the same derivation and accounting checks as every other reader.
//
// What this has been tested against: documents built to the XBRL 2.1 instance standard (contexts with start/end dates or an instant, facts with
// contextRef and unitRef). What it has NOT seen is a real NSE or BSE results file: the tag names below are the Ind AS taxonomy's as best known,
// with a words-based fallback through the same label rules the PDF reader uses, and the notes list every numeric tag it did not recognise so a
// real file shows exactly what to add.

import { normaliseUnit, detectUnitInText, type CurrencyUnit } from "../units";
import { checkAndDowngrade, deriveFields, type Raw } from "./derive";
import { matchLabel, type Target } from "./labels";
import { periodForEndDate } from "./periods";
import { AutofillError, type AutofillOptions, type AutofillPeriod, type AutofillResult, type FieldHit } from "./types";
import type { Basis } from "../types";

/** True when the text opens like an XBRL instance (an xbrl root element declaring the instance namespace). */
export function looksLikeXbrl(head: string): boolean {
  return /<(?:[\w.-]+:)?xbrl[\s>]/i.test(head) && /xbrl\.org\/2003\/instance/i.test(head);
}

/** Tag name (without prefix) to statement line. Exact names first; anything else goes through the label rules on the tag's words. */
const CONCEPTS: Record<string, Target> = {
  RevenueFromOperations: "revenue_from_operations", RevenueFromOperationsNet: "revenue_from_operations", SaleOfProductsAndServices: "revenue_from_operations",
  OtherIncome: "other_income", Income: "total_income", TotalIncome: "total_income", Expenses: "total_expenses", TotalExpenses: "total_expenses",
  FinanceCosts: "finance_costs", FinanceCost: "finance_costs",
  DepreciationDepletionAndAmortisationExpense: "depreciation_amortisation", DepreciationAndAmortisationExpense: "depreciation_amortisation",
  ProfitBeforeExceptionalItemsAndTax: "pre_exceptional_pbt", ExceptionalItemsBeforeTax: "exceptional_items", ProfitBeforeTax: "profit_before_tax", ProfitLossBeforeTax: "profit_before_tax",
  TaxExpense: "tax_expense", IncomeTaxExpense: "tax_expense",
  ProfitLossForPeriod: "profit_after_tax", ProfitLoss: "profit_after_tax", ProfitLossForPeriodFromContinuingOperations: "profit_after_tax",
  Assets: "total_assets", CurrentAssets: "current_assets", CashAndCashEquivalents: "cash_and_equivalents", Inventories: "inventory",
  TradeReceivablesCurrent: "trade_receivables", TradeReceivables: "trade_receivables", PropertyPlantAndEquipment: "fixed_assets",
  TradePayablesCurrent: "trade_payables", TradePayables: "trade_payables", CurrentLiabilities: "current_liabilities", Equity: "total_equity",
  NonCurrentLiabilities: "total_non_current_liabilities", EquityAndLiabilities: "total_equity_and_liabilities",
  CashFlowsFromUsedInOperatingActivities: "cash_from_operations", CashFlowsFromUsedInInvestingActivities: "cash_from_investing", CashFlowsFromUsedInFinancingActivities: "cash_from_financing",
};

const words = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

function targetFor(local: string): Target | null {
  if (CONCEPTS[local]) return CONCEPTS[local];
  const m = matchLabel(words(local), null);
  return m ? m.target : null;
}

type Context = { id: string; start: string | null; end: string; instant: boolean; dimensional: boolean };
type Fact = { prefix: string; local: string; context: string; unit: string | null; text: string };

const ATTR = /([\w:.-]+)\s*=\s*"([^"]*)"/g;
const dayMs = 86_400_000;
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

function readContexts(xml: string): Map<string, Context> {
  const out = new Map<string, Context>();
  for (const m of xml.matchAll(/<(?:[\w.-]+:)?context\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?context>/g)) {
    const id = /\bid\s*=\s*"([^"]+)"/.exec(m[1])?.[1];
    if (!id) continue;
    const body = m[2];
    const start = /<(?:[\w.-]+:)?startDate>\s*([\d-]{10})/.exec(body)?.[1] ?? null;
    const end = /<(?:[\w.-]+:)?endDate>\s*([\d-]{10})/.exec(body)?.[1] ?? null;
    const instant = /<(?:[\w.-]+:)?instant>\s*([\d-]{10})/.exec(body)?.[1] ?? null;
    // A context with a dimension (segment, scenario, explicit or typed member) is a breakdown of a total, never the total itself.
    const dimensional = /<(?:[\w.-]+:)?(?:segment|scenario|explicitMember|typedMember)\b/.test(body);
    if (instant) out.set(id, { id, start: null, end: instant, instant: true, dimensional });
    else if (start && end) out.set(id, { id, start, end, instant: false, dimensional });
  }
  return out;
}

function readFacts(xml: string): Fact[] {
  const facts: Fact[] = [];
  for (const m of xml.matchAll(/<(?:([\w.-]+):)?([\w.-]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*>([^<]*)<\/(?:\1:)?\2\s*>/g)) {
    const attrs = new Map<string, string>();
    for (const a of m[3].matchAll(ATTR)) attrs.set(a[1], a[2]);
    const context = attrs.get("contextRef");
    if (!context) continue;
    facts.push({ prefix: m[1] ?? "", local: m[2], context, unit: attrs.get("unitRef") ?? null, text: m[4].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim() });
  }
  return facts;
}

const num = (t: string): number | null => {
  const s = t.replace(/[\s,]/g, "");
  if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export function autofillFromXbrl(xml: string, opts: AutofillOptions): AutofillResult {
  if (!looksLikeXbrl(xml.slice(0, 20_000))) throw new AutofillError("This XML file is not an XBRL instance document (no xbrl element with the instance namespace).");
  const fyStart = opts.fyStartMonth ?? 4;
  const contexts = readContexts(xml);
  const facts = readFacts(xml);
  if (contexts.size === 0 || facts.length === 0) throw new AutofillError("The XBRL file has no contexts or no facts to read.");
  const notes: string[] = [];

  // Basis and unit are stated as text facts when the filer states them at all.
  let basis: Basis | null = null;
  let unit: { unit: CurrencyUnit; evidence: string; ambiguous: boolean } | null = null;
  for (const f of facts) {
    if (num(f.text) != null) continue;
    if (!basis && /nature|report|consolidat|standalone/i.test(f.local)) {
      if (/consolidated/i.test(f.text)) basis = "consolidated";
      else if (/standalone|stand-alone/i.test(f.text)) basis = "standalone";
    }
    if (!unit && /round|scale|unit|currency/i.test(f.local)) {
      const d = detectUnitInText(f.text) ?? (normaliseUnit(f.text) ? { unit: normaliseUnit(f.text) as CurrencyUnit, evidence: f.text, ambiguous: false } : null);
      if (d) unit = { unit: d.unit, evidence: `${f.local}: "${f.text}"`, ambiguous: d.ambiguous };
    }
  }
  const finalBasis = basis ?? opts.preferredBasis ?? null;
  if (!basis) notes.push("The file does not say whether it is standalone or consolidated; the basis was set from the project.");

  // Group usable facts by period. Duration contexts of about a quarter or a year are periods; part-years (six, nine months) are not stored.
  type Slot = { end: string; kind: "year" | "quarter"; raw: Raw; ctxIds: Set<string> };
  const slots = new Map<string, Slot>();
  const skippedSpans = new Set<string>();
  const slotFor = (end: string, kind: "year" | "quarter") => {
    const key = `${end}|${kind}`;
    if (!slots.has(key)) slots.set(key, { end, kind, raw: {}, ctxIds: new Set() });
    return slots.get(key)!;
  };
  for (const c of contexts.values()) {
    if (c.dimensional || c.instant) continue;
    const days = Math.round((ms(c.end) - ms(c.start as string)) / dayMs) + 1;
    if (days >= 80 && days <= 100) slotFor(c.end, "quarter").ctxIds.add(c.id);
    else if (days >= 350 && days <= 380) slotFor(c.end, "year").ctxIds.add(c.id);
    else skippedSpans.add(`${c.start} to ${c.end}`);
  }
  if (skippedSpans.size > 0) notes.push(`Skipped periods of other lengths (${[...skippedSpans].slice(0, 4).join("; ")}): Sentinel stores full years and single quarters.`);

  const durationSlotOf = new Map<string, Slot>();
  for (const s of slots.values()) for (const id of s.ctxIds) durationSlotOf.set(id, s);
  // A balance sheet is an instant: it belongs to the year ending that day if there is one, otherwise to the quarter.
  const instantSlot = (end: string): Slot | null => slots.get(`${end}|year`) ?? slots.get(`${end}|quarter`) ?? null;

  const unrecognised = new Map<string, number>();
  let numericFacts = 0, mapped = 0;
  for (const f of facts) {
    const v = num(f.text);
    if (v == null) continue;
    const ctx = contexts.get(f.context);
    if (!ctx || ctx.dimensional) continue;
    numericFacts++;
    const slot = ctx.instant ? instantSlot(ctx.end) : durationSlotOf.get(ctx.id);
    if (!slot) continue;
    const target = targetFor(f.local);
    if (!target) { unrecognised.set(f.local, (unrecognised.get(f.local) ?? 0) + 1); continue; }
    if (slot.raw[target]) continue; // the first fact for a line wins
    slot.raw[target] = { value: v, source: `XBRL ${f.prefix ? f.prefix + ":" : ""}${f.local} | context ${ctx.id} (${ctx.start ? ctx.start + " to " : "as at "}${ctx.end})`, confidence: "high" } as FieldHit;
    mapped++;
  }
  if (mapped === 0) throw new AutofillError("None of the numeric facts in this XBRL file matched a statement line Sentinel knows. The notes list the tags it saw.");
  if (unrecognised.size > 0) {
    const top = [...unrecognised.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => k);
    notes.push(`Read ${mapped} figures; ${unrecognised.size} other numeric tags were not recognised (${top.join(", ")}${unrecognised.size > top.length ? ", ..." : ""}).`);
  }

  // No stated unit: amounts this large are plain rupees, which XBRL filings often use.
  const revenue = [...slots.values()].map((s) => s.raw["revenue_from_operations"]?.value ?? 0).reduce((a, b) => Math.max(a, Math.abs(b)), 0);
  const unitResult = unit
    ? { unit: unit.unit, source: "sheet" as const, evidence: unit.evidence, ambiguous: unit.ambiguous }
    : revenue >= 1e8
      ? { unit: "INR" as CurrencyUnit, source: "sheet" as const, evidence: "The file states no unit; amounts this large are probably plain rupees", ambiguous: true }
      : { unit: null, source: "none" as const, evidence: null, ambiguous: false };

  const periods: AutofillPeriod[] = [];
  for (const s of [...slots.values()].sort((a, b) => b.end.localeCompare(a.end) || (a.kind === "year" ? -1 : 1))) {
    if (Object.keys(s.raw).length === 0) continue;
    const { fields, notes: dnotes } = deriveFields(s.raw);
    const issues = checkAndDowngrade(fields);
    const p = periodForEndDate(s.end, s.kind, fyStart);
    periods.push({ key: `${s.end}|${s.kind}`, period_type: p.period_type, period_label: p.period_label, period_end_date: p.period_end_date, basis: finalBasis, fields, notes: dnotes, issues });
  }
  periods.sort((a, b) => (b.period_end_date ?? "").localeCompare(a.period_end_date ?? ""));
  return { kind: "xbrl", unit: unitResult, periods, notes, pages_used: [], layout: "XBRL instance", source_file: opts.sourceFile ?? "results.xml", key_audit_matters_text: null };
}
