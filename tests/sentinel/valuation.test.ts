// Peer valuation, against hand-worked numbers. The company reports in crore throughout (croreFactor 1), so
// the statement's own figures and the crore terms every valuation figure is expressed in are the same number.

import test from "node:test";
import assert from "node:assert/strict";
import { bookValuePerShareRupees, computeValuation, enterpriseValueCr, epsRupees, evToEbitda, evToSales, fcfYield, marketCapCr, peRatio, priceToBook } from "../../app/sentinel/lib/valuation";
import { near, st, ws } from "./helpers";

// Price 1,000 (not crore - a real rupee share price), 5,00,000 shares -> market cap 1,000 x 5,00,000 / 1e7 = 50 cr.
const company = ws("a", { currency_unit: "INR_CRORE" });
const priced = ws("a", { currency_unit: "INR_CRORE", market_price: 1000 });
const stmt = st("a", { revenue_from_operations: 100, ebitda: 13, profit_after_tax: 10, total_debt: 20, cash_and_equivalents: 5, shares_outstanding: 500000 });

test("market cap: price x shares, in crore - null without a price or a share count", () => {
  near(marketCapCr(1000, 500000)!, 50);
  assert.equal(marketCapCr(null, 500000), null);
  assert.equal(marketCapCr(1000, null), null);
  assert.equal(marketCapCr(0, 500000), null); // a price of exactly zero is not a real quote
  assert.equal(marketCapCr(-5, 500000), null);
});

test("enterprise value: market cap + debt - cash, each converted through the company's own crore factor", () => {
  near(enterpriseValueCr(50, stmt, 1)!, 65); // 50 + 20 - 5
  // At a lakh factor of 0.01, debt 20 lakh and cash 5 lakh are 0.2 cr and 0.05 cr - a tenth the size.
  near(enterpriseValueCr(50, stmt, 0.01)!, 50.15);
  assert.equal(enterpriseValueCr(null, stmt, 1), null);
});

test("P/E: market cap / PAT; blank for a loss-making year, not a negative multiple", () => {
  near(peRatio(50, stmt, 1)!, 5); // 50 / 10
  assert.equal(peRatio(50, { ...stmt, profit_after_tax: -10 }, 1), null);
  assert.equal(peRatio(null, stmt, 1), null);
});

test("EV/EBITDA and EV/Sales: EV over each line, converted through the crore factor", () => {
  near(evToEbitda(65, stmt, 1)!, 5); // 65 / 13
  near(evToSales(65, stmt, 1)!, 0.65); // 65 / 100
  assert.equal(evToEbitda(65, { ...stmt, ebitda: null }, 1), null);
  assert.equal(evToEbitda(65, { ...stmt, ebitda: -13 }, 1), null); // negative EBITDA has no meaningful multiple
});

test("computeValuation: every figure at once, blank across the board without a price on file", () => {
  const v = computeValuation(priced, stmt, 1);
  near(v.market_cap_cr!, 50);
  near(v.ev_cr!, 65);
  near(v.pe_ratio!, 5);
  near(v.ev_ebitda!, 5);
  near(v.ev_sales!, 0.65);

  const noPrice = computeValuation(company, stmt, 1);
  // Per-share figures need shares outstanding, not a price: EPS is 10 crore / 5,00,000 shares = 200 rupees.
  assert.deepEqual(noPrice, { market_cap_cr: null, ev_cr: null, pe_ratio: null, ev_ebitda: null, ev_sales: null, pb_ratio: null, fcf_yield: null, fcf_cr: null, eps: 200, bvps: null });
});

test("computeValuation needs shares outstanding too - a price alone is not enough for a market cap", () => {
  const v = computeValuation(priced, { ...stmt, shares_outstanding: null }, 1);
  assert.equal(v.market_cap_cr, null);
  assert.equal(v.pe_ratio, null); // everything downstream of market cap is blank with it
});

// A year with cash flow and a balance sheet: revenue 100, PBT 14, tax 4, PAT 10, CFO 18, capex 8, equity 40, assets 80; 5,00,000 shares at 1,000 -> market cap 50 cr.
const full = st("a", { revenue_from_operations: 100, profit_before_tax: 14, tax_expense: 4, profit_after_tax: 10, cash_from_operations: 18, capex: 8, total_equity: 40, total_assets: 80, shares_outstanding: 500000 });

test("per-share figures: EPS 200 and book value 800 rupees, the same in lakh as in crore", () => {
  near(epsRupees(full, 1)!, 200); // 10 cr x 1e7 / 5,00,000
  near(bookValuePerShareRupees(full, 1)!, 800); // 40 cr x 1e7 / 5,00,000
  const lakh = { ...full, profit_after_tax: 1000, total_equity: 4000 }; // the same year entered in lakh
  near(epsRupees(lakh, 0.01)!, 200);
  near(bookValuePerShareRupees(lakh, 0.01)!, 800);
  assert.equal(epsRupees({ ...full, shares_outstanding: null }, 1), null);
  assert.equal(epsRupees({ ...full, shares_outstanding: 0 }, 1), null);
  near(epsRupees({ ...full, profit_after_tax: -10 }, 1)!, -200); // a loss is a real, negative EPS
  assert.equal(bookValuePerShareRupees({ ...full, total_equity: -5 }, 1), null); // no book value to price against
});

test("price / book and free-cash-flow yield: 50 / 40 = 1.25x and 10 / 50 = 20%; blank for negative equity, no cash flow or a quarter", () => {
  const cap = marketCapCr(1000, 500000);
  near(priceToBook(cap, full, 1)!, 1.25);
  assert.equal(priceToBook(cap, { ...full, total_equity: -5 }, 1), null);
  assert.equal(priceToBook(null, full, 1), null);
  near(fcfYield(cap, full, 1)!, 0.2); // (18 - 8) / 50
  near(fcfYield(cap, { ...full, capex: 30 }, 1)!, -0.24); // negative free cash flow is a negative yield, not a blank
  assert.equal(fcfYield(cap, { ...full, cash_from_operations: null }, 1), null);
  assert.equal(fcfYield(cap, { ...full, period_type: "Q2" }, 1), null);
  const v = computeValuation(priced, full, 1);
  near(v.pb_ratio!, 1.25);
  near(v.fcf_yield!, 0.2);
  near(v.fcf_cr!, 10);
  near(v.eps!, 200);
  near(v.bvps!, 800);
});
