// Calculation checks for the Sentinel engine. Each expected number below was
// worked out by hand (the working is in the comment beside it), not read
// back from the code.

import test from "node:test";
import assert from "node:assert/strict";
import { buildPeerTable, computeRatios, findPriorYear } from "../../app/sentinel/lib/engine";
import { st, ws, near } from "./helpers";

const ratio = (cur: Parameters<typeof st>[1], prior: Parameters<typeof st>[1] | null, id: string, sector = "tyre") =>
  computeRatios(st("a", cur), prior ? st("a", prior) : null, sector)[id];

test("margins: ebitda 200 and pat 100 on revenue 1000 -> 20% and 10%", () => {
  assert.ok(near(ratio({ ebitda: 200, profit_after_tax: 100 }, null, "ebitda_margin"), 0.2));
  assert.ok(near(ratio({ ebitda: 200, profit_after_tax: 100 }, null, "pat_margin"), 0.1));
});

test("margins: missing ebitda or zero revenue gives null, never zero or NaN", () => {
  assert.equal(ratio({ ebitda: null }, null, "ebitda_margin"), null);
  assert.equal(ratio({ revenue_from_operations: 0, ebitda: 5 }, null, "ebitda_margin"), null);
});

test("revenue growth: 1200 vs 1000 -> +20%", () => {
  assert.ok(near(ratio({ revenue_from_operations: 1200 }, { revenue_from_operations: 1000 }, "yoy_revenue_growth"), 0.2));
});

test("PAT growth on a positive base: 150 vs 100 -> +50%", () => {
  assert.ok(near(ratio({ profit_after_tax: 150 }, { profit_after_tax: 100 }, "yoy_pat_growth"), 0.5));
});

test("PAT growth on a negative base keeps its direction: loss -100 -> -50 is an improvement (+50%)", () => {
  // (-50 - -100) / |-100| = 50 / 100
  assert.ok(near(ratio({ profit_after_tax: -50 }, { profit_after_tax: -100 }, "yoy_pat_growth"), 0.5));
});

test("PAT growth on a negative base: loss -100 -> -200 is a deterioration (-100%)", () => {
  // (-200 - -100) / 100
  assert.ok(near(ratio({ profit_after_tax: -200 }, { profit_after_tax: -100 }, "yoy_pat_growth"), -1));
});

test("PAT growth: Godrej-style turnaround -560.6 -> +1896.1 is positive (+438.2%), not -438%", () => {
  // (1896.1 + 560.6) / 560.6
  assert.ok(near(ratio({ profit_after_tax: 1896.1 }, { profit_after_tax: -560.6 }, "yoy_pat_growth"), 2456.7 / 560.6, 1e-9));
});

test("PAT growth: a zero prior year cannot be divided by", () => {
  assert.equal(ratio({ profit_after_tax: 10 }, { profit_after_tax: 0 }, "yoy_pat_growth"), null);
});

test("exceptional items as a share of pre-exceptional PBT: loss of 400 inside PBT 600 -> 400 / 1000 = 40%", () => {
  assert.ok(near(ratio({ profit_before_tax: 600, exceptional_items: 400 }, null, "exceptional_item_pct_of_pbt"), 0.4));
});

test("exceptional items: a large exceptional GAIN (-100 inside PBT 150) is measured, 100 / |50| = 200%", () => {
  assert.ok(near(ratio({ profit_before_tax: 150, exceptional_items: -100 }, null, "exceptional_item_pct_of_pbt"), 2));
});

test("exceptional items: pre-exceptional PBT of zero gives null", () => {
  assert.equal(ratio({ profit_before_tax: -100, exceptional_items: 100 }, null, "exceptional_item_pct_of_pbt"), null);
});

test("exceptional items: none reported gives null rather than 0%", () => {
  assert.equal(ratio({ exceptional_items: null }, null, "exceptional_item_pct_of_pbt"), null);
});

test("working-capital days on a full year use 365", () => {
  const s = { inventory: 100, total_expenses: 1000, trade_receivables: 50, trade_payables: 80 };
  assert.ok(near(ratio(s, null, "inventory_days"), 36.5)); // 100 / 1000 * 365
  assert.ok(near(ratio(s, null, "receivable_days"), 18.25)); // 50 / 1000 * 365
  assert.ok(near(ratio(s, null, "payable_days"), 29.2)); // 80 / 1000 * 365
  assert.ok(near(ratio(s, null, "cash_conversion_cycle"), 25.55)); // 36.5 + 18.25 - 29.2
});

test("working-capital days on a QUARTER use the length of a quarter, not 365", () => {
  // Same business, one quarter of flows: revenue 250, expenses 250. Inventory 100 is the
  // same year-end style balance, so the days figure must not quadruple.
  const q = {
    period_type: "Q3" as const,
    period_end_date: "2025-12-31",
    revenue_from_operations: 250,
    inventory: 100,
    total_expenses: 250,
    trade_receivables: 50,
    trade_payables: 80,
  };
  assert.ok(near(ratio(q, null, "inventory_days"), 36.5, 1e-9)); // 100 / 250 * 91.25
  assert.ok(near(ratio(q, null, "receivable_days"), 18.25, 1e-9)); // 50 / 250 * 91.25
  assert.ok(near(ratio(q, null, "payable_days"), 29.2, 1e-9)); // 80 / 250 * 91.25
});

test("balance-sheet ratios: current 150/100 = 1.5x, debt 50 / equity 200 = 0.25x", () => {
  const s = { current_assets: 150, current_liabilities: 100, total_debt: 50, total_equity: 200 };
  assert.ok(near(ratio(s, null, "current_ratio"), 1.5));
  assert.ok(near(ratio(s, null, "debt_to_equity"), 0.25));
});

test("debt-to-equity with negative equity is not reported as a healthy negative number", () => {
  assert.equal(ratio({ total_debt: 50, total_equity: -20 }, null, "debt_to_equity"), null);
});

// --- prior-year pairing -------------------------------------------------------------------

test("prior year: only the same company, same period type, exactly one year earlier", () => {
  const cur = st("a", { period_end_date: "2026-03-31" });
  const all = [
    cur,
    st("a", { period_label: "FY25", period_end_date: "2025-03-31" }),
    st("b", { period_label: "FY25-b", period_end_date: "2025-03-31" }),
    st("a", { period_label: "Q4 FY25", period_type: "Q4", period_end_date: "2025-03-31" }),
  ];
  assert.equal(findPriorYear(cur, all)?.period_label, "FY25");
});

test("prior year: a standalone FY25 is NOT used as the base for a consolidated FY26", () => {
  const cur = st("a", { basis: "consolidated" });
  const all = [cur, st("a", { period_label: "FY25", period_end_date: "2025-03-31", basis: "standalone" })];
  assert.equal(findPriorYear(cur, all), null);
});

test("prior year: when both bases exist for last year, the matching basis wins whatever the order", () => {
  const cur = st("a", { basis: "consolidated" });
  const sa = st("a", { period_label: "FY25", period_end_date: "2025-03-31", basis: "standalone" });
  const co = st("a", { period_label: "FY25", period_end_date: "2025-03-31", basis: "consolidated" });
  assert.equal(findPriorYear(cur, [cur, sa, co])?.basis, "consolidated");
  assert.equal(findPriorYear(cur, [cur, co, sa])?.basis, "consolidated");
});

// --- peer table ------------------------------------------------------------------------------

test("peer table: absolute figures are normalised to crore so lakh and crore companies compare", () => {
  const workspaces = [ws("big", { currency_unit: "INR_LAKH" }), ws("small", { currency_unit: "INR_CRORE" })];
  const statements = [
    st("big", { revenue_from_operations: 1_000_000, profit_before_tax: 100_000, profit_after_tax: 80_000 }), // lakh
    st("small", { revenue_from_operations: 9_000, profit_before_tax: 900, profit_after_tax: 700 }), // crore
  ];
  const rows = buildPeerTable(workspaces, statements, "small", "FY");
  const big = rows.find((r) => r.workspace_id === "big")!;
  assert.ok(near(big.revenue_cr, 10_000)); // 1,000,000 lakh = 10,000 crore
  assert.ok(near(big.pbt_cr, 1_000));
  assert.ok(near(big.pat_cr, 800));
  assert.deepEqual(rows.map((r) => r.workspace_id), ["big", "small"]); // sorted by revenue in crore
  assert.ok(near(big.ratios.pat_margin, 0.08)); // ratios do not depend on the unit
});

test("peer table: valuation figures land in ratios too, converted through the same crore factor", () => {
  // Price 500, 2,00,00,000 shares -> market cap 500 x 2,00,00,000 / 1e7 = 1,000 cr.
  // Debt 50,000 lakh and cash 20,000 lakh are 500 cr and 200 cr -> EV = 1,000 + 500 - 200 = 1,300 cr.
  // PAT 800 cr (as above) -> P/E 1,000 / 800 = 1.25x. EBITDA 150,000 lakh = 1,500 cr -> EV/EBITDA 1,300 / 1,500.
  const w = ws("big", { currency_unit: "INR_LAKH", market_price: 500 });
  const stmt = st("big", {
    revenue_from_operations: 1_000_000, profit_before_tax: 100_000, profit_after_tax: 80_000, ebitda: 150_000,
    total_debt: 50_000, cash_and_equivalents: 20_000, shares_outstanding: 20_000_000,
  });
  const rows = buildPeerTable([w], [stmt], "big", "FY");
  const r = rows[0];
  assert.ok(near(r.ratios.market_cap_cr!, 1000));
  assert.ok(near(r.ratios.ev_cr!, 1300));
  assert.ok(near(r.ratios.pe_ratio!, 1.25));
  assert.ok(near(r.ratios.ev_ebitda!, 1300 / 1500));
});

test("peer table: when two bases share the latest date the workspace's comparison basis is used", () => {
  const w = ws("a", { comparison_basis: "consolidated" });
  const sa = st("a", { basis: "standalone", revenue_from_operations: 700 });
  const co = st("a", { basis: "consolidated", revenue_from_operations: 900 });
  for (const order of [[sa, co], [co, sa]]) {
    const rows = buildPeerTable([w], order, "a", "FY");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].revenue_cr, 900);
    assert.equal(rows[0].basis_caveat, null);
  }
});

test("peer table: a peer in another sector never appears", () => {
  const rows = buildPeerTable([ws("a"), ws("f", { sector: "fmcg" })], [st("a"), st("f")], "a", "FY");
  assert.deepEqual(rows.map((r) => r.workspace_id), ["a"]);
});

test("peer table rows carry the prior-year figures (used to describe a swing without back-solving)", () => {
  const w = ws("a");
  const rows = buildPeerTable(
    [w],
    [
      st("a", { revenue_from_operations: 1200, profit_after_tax: -50 }),
      st("a", { period_label: "FY25", period_end_date: "2025-03-31", revenue_from_operations: 1000, profit_after_tax: -100 }),
    ],
    "a",
    "FY"
  );
  const row = rows[0] as unknown as Record<string, unknown>;
  assert.equal(row.prior_revenue_cr, 1000);
  assert.equal(row.prior_pat_cr, -100);
  assert.equal(rows[0].has_prior_year, true);
});
