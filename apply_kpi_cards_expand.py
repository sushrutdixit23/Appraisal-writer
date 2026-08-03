# -*- coding: utf-8 -*-
"""
Sentinel — expand KPI Dashboard cards to every ratio already computed
(no new data collection needed). Adds one new derived ratio
(cash_conversion_cycle) to config.ts, purely combinatorial from three
existing fields - no schema or form change. Run from the repo root.
"""
import io
import os

ROOT = os.getcwd()

def read(path):
    with io.open(path, "r", encoding="utf-8") as f:
        return f.read()

def write(path, content):
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)

def brace_balance(path, content):
    opens = content.count("{")
    closes = content.count("}")
    status = "OK" if opens == closes else "MISMATCH"
    print("  brace check " + path + ": { " + str(opens) + "  } " + str(closes) + "  -> " + status)
    return opens == closes

def apply_edits(path, edits):
    src = read(path)
    current = src
    for old, new, label in edits:
        count = current.count(old)
        if count != 1:
            print("!! ANCHOR FAILED (" + label + "): found " + str(count) + " occurrences, expected 1. " + path + " NOT written.")
            return False
        current = current.replace(old, new, 1)
    write(path, current)
    print("edited " + path)
    brace_balance(path, current)
    return True

# ---------------------------------------------------------------------
# config.ts — add cash_conversion_cycle
# ---------------------------------------------------------------------
config_path = os.path.join(ROOT, "app", "sentinel", "lib", "config.ts")

config_edits = []
config_edits.append((
    '''  {
    id: "payable_days",
    compute: (s) => safeDays(s.trade_payables, s.total_expenses),
  },
];''',
    '''  {
    id: "payable_days",
    compute: (s) => safeDays(s.trade_payables, s.total_expenses),
  },
  {
    id: "cash_conversion_cycle",
    // Inventory days + receivable days - payable days, using the exact
    // same three formulas already defined above rather than
    // recomputing them a different way. Null if any of the three
    // inputs is missing - same null-safe convention as the rest of
    // this file.
    compute: (s) => {
      const inv = safeDays(s.inventory, s.total_expenses);
      const rec = safeDays(s.trade_receivables, s.revenue_from_operations);
      const pay = safeDays(s.trade_payables, s.total_expenses);
      if (inv == null || rec == null || pay == null) return null;
      return inv + rec - pay;
    },
  },
];''',
    "config.ts: add cash_conversion_cycle ratio",
))

apply_edits(config_path, config_edits)

# ---------------------------------------------------------------------
# KPI Dashboard page.tsx
# ---------------------------------------------------------------------
page_path = os.path.join(ROOT, "app", "sentinel", "kpi", "page.tsx")

page_edits = []

# 1. Generalize formatBenchmarkNote from boolean isRatio to a unit param
page_edits.append((
    '''function formatBenchmarkNote(b: Benchmark | null, isRatio: boolean): string | null {
  if (!b || !b.closestPeer || b.gapToClosestPeer == null) return null;
  const sign = b.gapToClosestPeer >= 0 ? "+" : "";
  const gap = isRatio
    ? `${sign}${(b.gapToClosestPeer * 100).toFixed(1)}pp`
    : `${sign}${b.gapToClosestPeer.toLocaleString("en-IN", { maximumFractionDigits: 0 })} cr`;
  return `vs ${b.closestPeer.company_name}: ${gap}`;
}''',
    '''function formatBenchmarkNote(
  b: Benchmark | null,
  unit: "pp" | "cr" | "x" | "d"
): string | null {
  if (!b || !b.closestPeer || b.gapToClosestPeer == null) return null;
  const sign = b.gapToClosestPeer >= 0 ? "+" : "";
  const magnitude =
    unit === "pp"
      ? `${(b.gapToClosestPeer * 100).toFixed(1)}pp`
      : unit === "x"
      ? `${b.gapToClosestPeer.toFixed(2)}x`
      : unit === "d"
      ? `${b.gapToClosestPeer.toFixed(0)}d`
      : `${b.gapToClosestPeer.toLocaleString("en-IN", { maximumFractionDigits: 0 })} cr`;
  return `vs ${b.closestPeer.company_name}: ${sign}${magnitude}`;
}''',
    "page.tsx: generalize formatBenchmarkNote to a unit param",
))

# 2. Update the 4 existing call sites to the new unit values
page_edits.append((
    'note={formatBenchmarkNote(revenueBenchmark, false)}',
    'note={formatBenchmarkNote(revenueBenchmark, "cr")}',
    "page.tsx: revenue note -> cr unit",
))
page_edits.append((
    'note={formatBenchmarkNote(ebitdaBenchmark, true)}',
    'note={formatBenchmarkNote(ebitdaBenchmark, "pp")}',
    "page.tsx: ebitda note -> pp unit",
))
page_edits.append((
    'note={formatBenchmarkNote(patBenchmark, true)}',
    'note={formatBenchmarkNote(patBenchmark, "pp")}',
    "page.tsx: pat margin note -> pp unit",
))
page_edits.append((
    'note={formatBenchmarkNote(yoyBenchmark, true)}',
    'note={formatBenchmarkNote(yoyBenchmark, "pp")}',
    "page.tsx: revenue yoy note -> pp unit",
))

# 3. Add days/ratioX formatters
page_edits.append((
    '''const pct = (v: number | null) => (v == null ? "\\u2014" : `${(v * 100).toFixed(1)}%`);
const num = (v: number | null) =>
  v == null ? "\\u2014" : v.toLocaleString("en-IN", { maximumFractionDigits: 0 });''',
    '''const pct = (v: number | null) => (v == null ? "\\u2014" : `${(v * 100).toFixed(1)}%`);
const num = (v: number | null) =>
  v == null ? "\\u2014" : v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const days = (v: number | null) => (v == null ? "\\u2014" : `${v.toFixed(0)}d`);
const ratioX = (v: number | null) => (v == null ? "\\u2014" : `${v.toFixed(2)}x`);''',
    "page.tsx: add days/ratioX formatters",
))

# 4. Add the 8 new benchmark computations
page_edits.append((
    '''  const revenueBenchmark = getBenchmark(peerRows, selected.id, "revenue_cr");
  const ebitdaBenchmark = getBenchmark(peerRows, selected.id, "ebitda_margin");
  const patBenchmark = getBenchmark(peerRows, selected.id, "pat_margin");
  const yoyBenchmark = getBenchmark(peerRows, selected.id, "yoy_revenue_growth");''',
    '''  const revenueBenchmark = getBenchmark(peerRows, selected.id, "revenue_cr");
  const ebitdaBenchmark = getBenchmark(peerRows, selected.id, "ebitda_margin");
  const patBenchmark = getBenchmark(peerRows, selected.id, "pat_margin");
  const yoyBenchmark = getBenchmark(peerRows, selected.id, "yoy_revenue_growth");
  const patAbsBenchmark = getBenchmark(peerRows, selected.id, "pat_cr");
  const patYoyBenchmark = getBenchmark(peerRows, selected.id, "yoy_pat_growth");
  const currentRatioBenchmark = getBenchmark(peerRows, selected.id, "current_ratio");
  const debtEquityBenchmark = getBenchmark(peerRows, selected.id, "debt_to_equity", "lower_is_better");
  const inventoryDaysBenchmark = getBenchmark(peerRows, selected.id, "inventory_days", "lower_is_better");
  const receivableDaysBenchmark = getBenchmark(peerRows, selected.id, "receivable_days", "lower_is_better");
  const payableDaysBenchmark = getBenchmark(peerRows, selected.id, "payable_days");
  const cccBenchmark = getBenchmark(peerRows, selected.id, "cash_conversion_cycle", "lower_is_better");''',
    "page.tsx: compute 8 new benchmarks",
))

# 5. Add the 8 new KPI cards to the grid
page_edits.append((
    '''        <KpiCard
          label="Revenue YoY"
          value={pct(selfRow?.ratios.yoy_revenue_growth ?? null)}
          note={formatBenchmarkNote(yoyBenchmark, "pp")}
        />
      </div>''',
    '''        <KpiCard
          label="Revenue YoY"
          value={pct(selfRow?.ratios.yoy_revenue_growth ?? null)}
          note={formatBenchmarkNote(yoyBenchmark, "pp")}
        />
        <KpiCard
          label="PAT (latest FY)"
          value={selfRow ? num(selfRow.pat_cr) : "\\u2014"}
          note={formatBenchmarkNote(patAbsBenchmark, "cr")}
        />
        <KpiCard
          label="PAT YoY"
          value={pct(selfRow?.ratios.yoy_pat_growth ?? null)}
          note={formatBenchmarkNote(patYoyBenchmark, "pp")}
        />
        <KpiCard
          label="Current Ratio"
          value={ratioX(selfRow?.ratios.current_ratio ?? null)}
          note={formatBenchmarkNote(currentRatioBenchmark, "x")}
        />
        <KpiCard
          label="Debt-to-Equity"
          value={ratioX(selfRow?.ratios.debt_to_equity ?? null)}
          note={formatBenchmarkNote(debtEquityBenchmark, "x")}
        />
        <KpiCard
          label="Inventory Days"
          value={days(selfRow?.ratios.inventory_days ?? null)}
          note={formatBenchmarkNote(inventoryDaysBenchmark, "d")}
        />
        <KpiCard
          label="Receivable Days"
          value={days(selfRow?.ratios.receivable_days ?? null)}
          note={formatBenchmarkNote(receivableDaysBenchmark, "d")}
        />
        <KpiCard
          label="Payable Days"
          value={days(selfRow?.ratios.payable_days ?? null)}
          note={formatBenchmarkNote(payableDaysBenchmark, "d")}
        />
        <KpiCard
          label="Cash Conversion Cycle"
          value={days(selfRow?.ratios.cash_conversion_cycle ?? null)}
          note={formatBenchmarkNote(cccBenchmark, "d")}
        />
      </div>''',
    "page.tsx: add 8 new KPI cards",
))

apply_edits(page_path, page_edits)

print("")
print("Done. Now run:  npm run build")
print("Then:            git status  /  git diff --stat")
