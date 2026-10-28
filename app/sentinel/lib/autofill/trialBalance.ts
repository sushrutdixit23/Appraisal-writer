// Sentinel autofill - a trial balance, the one export every ERP and every CA can produce (Tally, Zoho Books,
// ERPNext, SAP, QuickBooks all print one). It is a list of ledgers with a debit or credit closing balance and no
// statement structure; this reads each ledger into the bucket Schedule III puts it in, adds the buckets up into
// statement figures, and says out loud what it could not place.
//
// Honest limits, all reported to the person rather than hidden:
//   - A ledger it cannot place is listed with its amount ("unmapped"), and the balance-sheet identity check then
//     shows how much that leaves unexplained. Nothing is forced into a bucket to make the sums work.
//   - A mid-year trial balance has no closing stock booked and no year-end provisions, so cost of goods and profit
//     are provisional. The notes say so; the figures are all marked "verify".
//   - Group rows and the ledgers inside them must not both be present (the group total would be counted twice).
//     Tally's ledger-wise trial balance has ledgers only; its group-wise one has groups only. Either works.

import { parseNumberInput } from "../fields";
import type { NumericField } from "../fields";
import type { FieldHit } from "./types";

export type TbRow = { ledger: string; group: string | null; debit: number; credit: number };

type Bucket =
  | "revenue" | "other_income" | "cogs" | "opex" | "depreciation" | "finance_cost" | "tax"
  | "fixed_assets" | "investments" | "cash" | "receivables" | "inventory" | "other_current_assets"
  | "payables" | "other_current_liabilities" | "debt_current" | "debt" | "capital" | "reserves";

const INCOME_SIDE: Bucket[] = ["revenue", "other_income", "payables", "other_current_liabilities", "debt_current", "debt", "capital", "reserves"];

type Rule = { bucket: Bucket; test: RegExp };
type EitherRule = { asset: Bucket; liability: Bucket; test: RegExp };

// Tally's reserved group names, then the same ideas in other ERPs' words. Checked against the group first.
const GROUP_RULES: Rule[] = [
  { bucket: "revenue", test: /^(sales accounts?|revenue|revenue from operations|sales)$/ },
  { bucket: "other_income", test: /^(indirect incomes?|other income|income \(indirect\))$/ },
  { bucket: "cogs", test: /^(direct expenses?|purchase accounts?|cost of (goods sold|sales)|expenses \(direct\)|direct costs?)$/ },
  { bucket: "opex", test: /^(indirect expenses?|expenses \(indirect\)|operating expenses?|administrative expenses?)$/ },
  { bucket: "fixed_assets", test: /^(fixed assets?|property,? plant and equipment|non.current assets?)$/ },
  { bucket: "investments", test: /^investments?$/ },
  { bucket: "cash", test: /^(bank accounts?|cash.in.hand|cash and bank|cash and cash equivalents)$/ },
  { bucket: "receivables", test: /^(sundry debtors|trade receivables|accounts receivable)$/ },
  { bucket: "inventory", test: /^(stock.in.hand|inventor(y|ies))$/ },
  { bucket: "payables", test: /^(sundry creditors|trade payables|accounts payable)$/ },
  { bucket: "debt_current", test: /^(bank od|bank o\/d|bank overdraft|bank occ|bank od a\/c|current borrowings)$/ },
  { bucket: "debt", test: /^(loans? \(liability\)|secured loans?|unsecured loans?|borrowings|long.term borrowings)$/ },
  { bucket: "capital", test: /^(capital account|share capital|equity share capital)$/ },
  { bucket: "reserves", test: /^(reserves (and|&) surplus|reserves|retained earnings)$/ },
  { bucket: "other_current_liabilities", test: /^(current liabilities|duties (and|&) taxes|provisions|other current liabilities)$/ },
  { bucket: "other_current_assets", test: /^(current assets|loans (and|&) advances \(asset\)|deposits \(asset\)|other current assets)$/ },
];

// Without a group, the ledger's own name, most specific first. Order matters: "bank charges" is an expense and
// "bank od" is a loan, so both are tested before anything that mentions a bank.
const NAME_RULES: Rule[] = [
  { bucket: "depreciation", test: /depreciation|amorti[sz]ation/ },
  { bucket: "finance_cost", test: /interest (paid|expense|on (loan|od|overdraft|borrowing|term|cc))|finance (cost|charge)|loan processing/ },
  { bucket: "tax", test: /^(provision for )?(income|current|deferred) tax|income tax expense|tax expense/ },
  { bucket: "other_income", test: /interest (received|income|earned)|dividend (received|income)|other income|discount received|rent received|profit on sale|forex gain|miscellaneous income/ },
  { bucket: "revenue", test: /^sales|\bsales\b(?! return)|revenue|service (income|revenue)|fees? income|turnover/ },
  { bucket: "cogs", test: /purchase|cost of (goods|sales|revenue|services)|freight inward|opening stock|raw material consum|direct expense/ },
  { bucket: "opex", test: /salar|wages|\brent\b|electric|telephone|internet|travel|legal|professional|audit fee|insurance|repair|maintenance|advertis|marketing|commission|bank charge|printing|stationery|office|conveyance|staff|bonus|gratuity|provident fund|software subscription|subscription|miscellaneous expense|expenses?$/ },
  { bucket: "payables", test: /sundry creditor|trade payable|accounts payable|creditors/ },
  { bucket: "receivables", test: /sundry debtor|trade receivable|accounts receivable|debtors/ },
  { bucket: "debt_current", test: /bank od|bank overdraft|overdraft|cash credit|\bocc\b/ },
  { bucket: "inventory", test: /stock.in.hand|closing stock|inventor|finished goods|work in progress/ },
  { bucket: "fixed_assets", test: /fixed asset|plant|machinery|furniture|computer|building|vehicle|\bland\b|equipment|capital work|intangible|goodwill|software licen/ },
  { bucket: "investments", test: /investment|mutual fund/ },
  { bucket: "capital", test: /share capital|capital account|proprietor|partner'?s? capital|^capital\b/ },
  { bucket: "reserves", test: /reserve|surplus|retained|profit (and|&) loss a\/c|opening balance equity/ },
  { bucket: "cash", test: /^cash|cash.in.hand|petty cash|\bbank\b|current account|savings account/ },
];

// Names that are an asset when the balance is a debit and a liability when it is a credit (GST input vs payable,
// an advance given vs received, a loan given vs taken).
const EITHER_RULES: EitherRule[] = [
  { asset: "other_current_assets", liability: "other_current_liabilities", test: /gst|igst|cgst|sgst|tds|tcs|duties|statutory|advance|deposit|prepaid|input (tax|credit)|provision|outstanding|accrued|pf |esi / },
  { asset: "other_current_assets", liability: "debt", test: /loan|borrowing|debenture|unsecured|secured/ },
];

// Checked before the name rules: "Prepaid Expenses" ends in "expenses" but is an asset while it has a debit balance.
// A loan with a debit balance is money lent out (an asset); with a credit balance it is borrowing. Interest and
// fees on a loan are expenses, so those names are left for the name rules.
const PRE_EITHER: EitherRule[] = [
  { asset: "other_current_assets", liability: "other_current_liabilities", test: /prepaid|advance|security deposit|^deposits?\b/ },
  { asset: "other_current_assets", liability: "debt", test: /^(?!.*(interest|processing|fee|charge|expense)).*\bloans?\b/ },
];

const clean = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function classifyLedger(ledger: string, group: string | null, net: number): { bucket: Bucket; by: "group" | "name" } | null {
  if (group) {
    const g = clean(group);
    const hit = GROUP_RULES.find((r) => r.test.test(g));
    if (hit) return { bucket: hit.bucket, by: "group" };
  }
  const name = clean(ledger);
  // The group rules also describe a ledger that is itself named like a group (a group-wise trial balance).
  const asGroup = GROUP_RULES.find((r) => r.test.test(name));
  if (asGroup) return { bucket: asGroup.bucket, by: "group" };
  const pre = PRE_EITHER.find((r) => r.test.test(name));
  if (pre) return { bucket: net >= 0 ? pre.asset : pre.liability, by: "name" };
  const named = NAME_RULES.find((r) => r.test.test(name));
  if (named) return { bucket: named.bucket, by: "name" };
  const either = EITHER_RULES.find((r) => r.test.test(name));
  if (either) return { bucket: net >= 0 ? either.asset : either.liability, by: "name" };
  return null;
}

export type TrialBalanceRead = {
  fields: Partial<Record<NumericField, FieldHit>>;
  unmapped: { ledger: string; amount: number }[];
  /** Sum of debits and credits as printed - a trial balance that does not balance was exported wrongly. */
  totals: { debit: number; credit: number };
  notes: string[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function readTrialBalance(rows: TbRow[]): TrialBalanceRead {
  const notes: string[] = [];
  const sums = new Map<Bucket, number>();
  const ledgersIn = new Map<Bucket, { names: string[]; byName: boolean }>();
  const unmapped: { ledger: string; amount: number }[] = [];
  let debit = 0, credit = 0;

  for (const r of rows) {
    debit += r.debit;
    credit += r.credit;
    const net = r.debit - r.credit; // positive = a debit balance
    if (net === 0) continue;
    const c = classifyLedger(r.ledger, r.group, net);
    if (!c) { unmapped.push({ ledger: r.ledger, amount: round2(net) }); continue; }
    // Income, liabilities and equity are credit-natural; assets and expenses are debit-natural.
    const natural = INCOME_SIDE.includes(c.bucket) ? -net : net;
    sums.set(c.bucket, (sums.get(c.bucket) ?? 0) + natural);
    const entry = ledgersIn.get(c.bucket) ?? { names: [], byName: false };
    entry.names.push(r.ledger);
    if (c.by === "name") entry.byName = true;
    ledgersIn.set(c.bucket, entry);
  }

  const b = (k: Bucket) => round2(sums.get(k) ?? 0);
  const source = (...ks: Bucket[]) => {
    const names = ks.flatMap((k) => ledgersIn.get(k)?.names ?? []);
    const shown = names.slice(0, 4).join(", ");
    return `Trial balance: ${shown}${names.length > 4 ? ` and ${names.length - 4} more` : ""}`;
  };
  const conf = (...ks: Bucket[]) => (ks.some((k) => ledgersIn.get(k)?.byName) ? "low" : "medium") as FieldHit["confidence"];
  const fields: TrialBalanceRead["fields"] = {};
  const put = (key: NumericField, value: number, ks: Bucket[], derived?: string) => {
    if (ks.every((k) => !ledgersIn.has(k))) return;
    fields[key] = { value: round2(value), source: source(...ks), confidence: derived ? "low" : conf(...ks), ...(derived ? { derived } : {}) };
  };

  const revenue = b("revenue"), otherIncome = b("other_income");
  const expenses = b("cogs") + b("opex") + b("depreciation") + b("finance_cost");
  const pbt = revenue + otherIncome - expenses;
  const pat = pbt - b("tax");

  put("revenue_from_operations", revenue, ["revenue"]);
  put("other_income", otherIncome, ["other_income"]);
  put("total_income", revenue + otherIncome, ["revenue", "other_income"], "revenue + other income");
  put("depreciation_amortisation", b("depreciation"), ["depreciation"]);
  put("finance_costs", b("finance_cost"), ["finance_cost"]);
  put("tax_expense", b("tax"), ["tax"]);
  put("cost_of_goods_sold", b("cogs"), ["cogs"]);
  put("total_expenses", expenses, ["cogs", "opex", "depreciation", "finance_cost"], "all expense ledgers except income tax");
  put("profit_before_tax", pbt, ["revenue", "other_income", "cogs", "opex", "depreciation", "finance_cost"], "total income - total expenses");
  put("profit_after_tax", pat, ["revenue", "other_income", "cogs", "opex", "depreciation", "finance_cost", "tax"], "profit before tax - income tax");

  const currentAssets = b("cash") + b("receivables") + b("inventory") + b("other_current_assets");
  const totalDebt = b("debt") + b("debt_current");
  const currentLiabilities = b("payables") + b("other_current_liabilities") + b("debt_current");
  put("cash_and_equivalents", b("cash"), ["cash"]);
  put("trade_receivables", b("receivables"), ["receivables"]);
  put("inventory", b("inventory"), ["inventory"]);
  put("fixed_assets", b("fixed_assets"), ["fixed_assets"]);
  put("trade_payables", b("payables"), ["payables"]);
  put("current_assets", currentAssets, ["cash", "receivables", "inventory", "other_current_assets"], "cash + receivables + inventory + other current assets");
  put("total_assets", currentAssets + b("fixed_assets") + b("investments"), ["cash", "receivables", "inventory", "other_current_assets", "fixed_assets", "investments"], "current assets + fixed assets + investments");
  put("current_liabilities", currentLiabilities, ["payables", "other_current_liabilities", "debt_current"], "payables + duties and provisions + overdrafts");
  put("total_liabilities", currentLiabilities + b("debt"), ["payables", "other_current_liabilities", "debt_current", "debt"], "current liabilities + long-term loans");
  put("total_debt", totalDebt, ["debt", "debt_current"]);
  // The year's profit is not in the reserves until the books are closed, so it belongs to equity here.
  put("total_equity", b("capital") + b("reserves") + pat, ["capital", "reserves", "revenue", "cogs", "opex"], "capital + reserves + profit after tax for the period");

  if (Math.abs(debit - credit) > Math.max(1, Math.abs(debit) * 0.0005)) {
    notes.push(`The trial balance does not balance: debits total ${round2(debit)} and credits ${round2(credit)}. It was probably exported with a filter, or part of it is missing.`);
  }
  if (unmapped.length > 0) {
    const sum = round2(unmapped.reduce((n, u) => n + u.amount, 0));
    notes.push(`${unmapped.length} ledger(s) could not be placed (net ${sum}): ${unmapped.slice(0, 6).map((u) => u.ledger).join(", ")}${unmapped.length > 6 ? "..." : ""}. Figures built from the others are incomplete by that much.`);
  }
  if (!ledgersIn.has("inventory") && ledgersIn.has("cogs")) {
    notes.push("No closing stock is in this trial balance, as is usual before year-end, so cost of goods and profit are provisional.");
  }
  notes.push("Read from a trial balance by rules, not from a finished statement: every figure is marked for review.");
  return { fields, unmapped, totals: { debit: round2(debit), credit: round2(credit) }, notes };
}

// ---------------------------------------------------------------------------------------------
// Finding a trial balance inside a sheet
// ---------------------------------------------------------------------------------------------

const DR = /^(debit|dr\.?|debit amount|debit balance)$/i;
const CR = /^(credit|cr\.?|credit amount|credit balance)$/i;
const BAL = /^(closing balance|balance|closing)$/i;
const GRP = /^(group|parent|parent group|under|account type|type)$/i;

export type TbLayout = { headerRow: number; labelCol: number; debitCol: number | null; creditCol: number | null; balanceCol: number | null; groupCol: number | null };

export function findTrialBalanceLayout(rows: string[][]): TbLayout | null {
  for (let i = 0; i < Math.min(rows.length, 14); i++) {
    const r = rows[i];
    const debitCol = r.findIndex((c) => DR.test(c.trim()));
    const creditCol = r.findIndex((c) => CR.test(c.trim()));
    const balanceCol = r.findIndex((c) => BAL.test(c.trim()));
    if (!((debitCol >= 0 && creditCol >= 0) || balanceCol >= 0)) continue;
    const labelCol = r.findIndex((c, ci) => ci !== debitCol && ci !== creditCol && ci !== balanceCol && /ledger|particulars|account|name|description/i.test(c));
    if (labelCol < 0) continue;
    const groupCol = r.findIndex((c, ci) => ci !== labelCol && GRP.test(c.trim()));
    return { headerRow: i, labelCol, debitCol: debitCol >= 0 ? debitCol : null, creditCol: creditCol >= 0 ? creditCol : null, balanceCol: balanceCol >= 0 ? balanceCol : null, groupCol: groupCol >= 0 ? groupCol : null };
  }
  return null;
}

/** "1,20,000.00 Dr" / "45,000 Cr" / "(500)" -> signed (+ debit) number, or null. */
function balanceCell(raw: string): number | null {
  const m = /^(.*?)\s*(dr|cr)\.?$/i.exec(raw.trim());
  const p = parseNumberInput(m ? m[1] : raw);
  if (p.invalid || p.value == null) return null;
  return m && m[2].toLowerCase() === "cr" ? -Math.abs(p.value) : p.value;
}

export function trialBalanceRows(rows: string[][], layout: TbLayout): TbRow[] {
  const out: TbRow[] = [];
  for (const r of rows.slice(layout.headerRow + 1)) {
    const ledger = (r[layout.labelCol] ?? "").trim();
    if (!ledger || /^(grand )?total$|^total\b|^difference/i.test(ledger)) continue;
    let debit = 0, credit = 0;
    if (layout.debitCol != null && layout.creditCol != null) {
      debit = parseNumberInput(r[layout.debitCol] ?? "").value ?? 0;
      credit = parseNumberInput(r[layout.creditCol] ?? "").value ?? 0;
    } else if (layout.balanceCol != null) {
      const v = balanceCell(r[layout.balanceCol] ?? "");
      if (v == null) continue;
      if (v >= 0) debit = v; else credit = -v;
    }
    if (debit === 0 && credit === 0) continue;
    out.push({ ledger, group: layout.groupCol != null ? (r[layout.groupCol] ?? "").trim() || null : null, debit, credit });
  }
  return out;
}
