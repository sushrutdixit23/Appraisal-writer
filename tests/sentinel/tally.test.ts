// The Tally half of the live feed: the XML request, the reply read into ledgers, and the CSV the trial-balance
// reader takes. The reply below is hand-written in Tally's collection-export shape (debits NEGATIVE), so these
// tests prove our reading of that format, not Tally's behaviour - nothing here ran against a live Tally.

import test from "node:test";
import assert from "node:assert/strict";
import { ledgerCollectionRequest, ledgersToCsv, parseLedgerCollection, submitUrl, tallyDate } from "../../app/sentinel/lib/tally";
import { autofillFromSheet, parseCsv } from "../../app/sentinel/lib/autofill/sheet";

const ledger = (name: string, parent: string, closing: string) =>
  `<LEDGER NAME="${name}" RESERVEDNAME=""><PARENT>${parent}</PARENT><CLOSINGBALANCE>${closing}</CLOSINGBALANCE></LEDGER>`;

const reply = (rows: string[]) => `<ENVELOPE><BODY><DATA><COLLECTION>${rows.join("")}</COLLECTION></DATA></BODY></ENVELOPE>`;

// Debits 50,000 + 15,00,000 + 25,00,000 + 30,00,000 + 50,00,000 + 6,00,000 = 1,26,50,000
// Credits 1,00,00,000 + 18,50,000 + 8,00,000 = 1,26,50,000
const NATIVE = [
  ledger("Cash", "Cash-in-Hand", "-50000.00"),
  ledger("HDFC Bank A/c", "Bank Accounts", "-1500000.00"),
  ledger("ABC Ltd", "Sundry Debtors", "-2500000.00"),
  ledger("Computer Equipment", "Fixed Assets", "-3000000.00"),
  ledger("Salaries", "Indirect Expenses", "-5000000.00"),
  ledger("Rent", "Indirect Expenses", "-600000.00"),
  ledger("Software Services", "Sales Accounts", "10000000.00"),
  ledger("Share Capital", "Capital Account", "1850000.00"),
  ledger("XYZ &amp; Co", "Sundry Creditors", "800000.00"),
  ledger("Old Ledger", "Indirect Expenses", "0.00"),
];

test("the request asks for ledgers with parent and closing balance, for the dates given, in Tally's date format", () => {
  const x = ledgerCollectionRequest({ from: "2025-04-01", to: "2026-03-31", company: "Acme & Co" });
  assert.match(x, /<SVFROMDATE>20250401<\/SVFROMDATE><SVTODATE>20260331<\/SVTODATE>/);
  assert.match(x, /<SVCURRENTCOMPANY>Acme &amp; Co<\/SVCURRENTCOMPANY>/);
  assert.match(x, /<FETCH>Name,Parent,ClosingBalance<\/FETCH>/);
  assert.doesNotMatch(ledgerCollectionRequest({ from: "2025-04-01", to: "2026-03-31" }), /SVCURRENTCOMPANY/);
  assert.throws(() => tallyDate("31-03-2026"), /YYYY-MM-DD/);
});

test("Tally's debit-negative balances become debits and credits, zero ledgers drop, entities decode", () => {
  const r = parseLedgerCollection(reply(NATIVE));
  assert.equal(r.ledgers.length, 9);
  const by = (n: string) => r.ledgers.find((l) => l.ledger === n)!;
  assert.deepEqual([by("HDFC Bank A/c").debit, by("HDFC Bank A/c").credit], [1_500_000, 0]);
  assert.deepEqual([by("Software Services").debit, by("Software Services").credit], [0, 10_000_000]);
  assert.equal(by("XYZ & Co").group, "Sundry Creditors");
  assert.equal(r.totalDebit, 12_650_000);
  assert.equal(r.totalCredit, 12_650_000);
  assert.deepEqual(r.notes, []);
});

test("a reply that uses debit-positive numbers is detected from the groups and read correctly, with a note", () => {
  const flipped = NATIVE.map((x) => x.replace(/<CLOSINGBALANCE>(-?)([\d.]+)</, (_m, neg, n) => `<CLOSINGBALANCE>${neg ? "" : "-"}${n}<`));
  const r = parseLedgerCollection(reply(flipped));
  assert.equal(r.ledgers.find((l) => l.ledger === "HDFC Bank A/c")!.debit, 1_500_000);
  assert.equal(r.totalDebit, 12_650_000);
  assert.match(r.notes.join(" "), /debits as positive/);
});

test("an explicit Dr/Cr suffix wins over the sign convention", () => {
  const r = parseLedgerCollection(reply([ledger("Cash", "Cash-in-Hand", "50,000.00 Dr"), ledger("Capital", "Capital Account", "50,000.00 Cr")]));
  assert.deepEqual(r.ledgers.map((l) => [l.debit, l.credit]), [[50_000, 0], [0, 50_000]]);
});

test("an unbalanced trial balance is reported in plain words, not swallowed", () => {
  const r = parseLedgerCollection(reply(NATIVE.slice(0, -2)));
  assert.match(r.notes.join(" "), /does not balance: debits 12650000\.00 against credits 11850000\.00 \(debits higher by 800000\.00\)/);
});

test("a reply with no ledgers says how to fix Tally rather than returning an empty file", () => {
  assert.throws(() => parseLedgerCollection("<ENVELOPE></ENVELOPE>"), /company open in Tally/);
});

test("control characters Tally puts inside names are removed", () => {
  const r = parseLedgerCollection(reply([ledger("Cash&#4; in hand", "Cash-in-Hand", "-100.00")]));
  assert.equal(r.ledgers[0].ledger, "Cash in hand");
});

test("the CSV quotes names with commas and survives the trial-balance reader: revenue and balance-sheet totals match the ledgers", () => {
  const r = parseLedgerCollection(reply([...NATIVE, ledger("Fees, Misc", "Indirect Incomes", "0.00")]));
  const csv = ledgersToCsv([...r.ledgers, { ledger: "Fees, Misc", group: "Indirect Incomes", debit: 0, credit: 0 }]);
  assert.match(csv, /^Ledger,Group,Debit,Credit\n/);
  assert.match(csv, /"Fees, Misc",Indirect Incomes,,\n/);
  const read = autofillFromSheet(parseCsv(ledgersToCsv(r.ledgers)), { kind: "csv", periodEndDate: "2026-03-31" });
  assert.equal(read.layout, "trial balance");
  const fields = read.periods[0].fields as Record<string, { value: number }>;
  assert.equal(fields.revenue_from_operations.value, 10_000_000);
  assert.equal(fields.total_expenses.value, 5_600_000);
  assert.equal(fields.trade_receivables.value, 2_500_000);
});

test("the upload link, or a bare API path, becomes the submit URL; anything else is refused with the shape expected", () => {
  const t = "a".repeat(32);
  assert.equal(submitUrl(`https://app.example.com/submit/${t}`), `https://app.example.com/api/sentinel/submit/${t}`);
  assert.equal(submitUrl(` https://app.example.com/api/sentinel/submit/${t}/ `), `https://app.example.com/api/sentinel/submit/${t}`);
  assert.throws(() => submitUrl("https://app.example.com/submit/short"), /32-character token/);
});
