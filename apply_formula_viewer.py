# -*- coding: utf-8 -*-
"""
Sentinel - Tier 1: Formula Viewer. Adds a "formula" prop to KpiCard,
rendered as a native title-attribute tooltip on hover - same convention
HealthChip already uses for its detail text, not a new UI pattern. Every
formula string is copied directly from config.ts's DERIVED_RATIOS, word
for word, including the honest caveat where one exists (inventory/
payable days use Total Expenses as a COGS proxy - the schema has no
separate COGS field).
Only touches app/sentinel/kpi/page.tsx. Run from the repo root.
"""
import io
import os
import sys

ROOT = os.getcwd()

def read(path):
    with io.open(path, "r", encoding="utf-8") as f:
        return f.read()

def write(path, content):
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)

def brace_check(path, content):
    opens = content.count("{")
    closes = content.count("}")
    if opens == closes:
        print("[OK] brace check " + path + ": " + str(opens) + " open / " + str(closes) + " close")
    else:
        print("[MISS] brace mismatch in " + path + ": " + str(opens) + " open / " + str(closes) + " close")

def apply_edit(content, old, new, label, get_content_path):
    count = content.count(old)
    if count == 0:
        print("[MISS] " + label + ": anchor not found. Run: Get-Content \"" + get_content_path + "\" and paste it back.")
        return None
    if count > 1:
        print("[MISS] " + label + ": anchor found " + str(count) + " times, expected 1. Run: Get-Content \"" + get_content_path + "\" and paste it back.")
        return None
    print("[OK] " + label)
    return content.replace(old, new, 1)

if not os.path.exists(os.path.join(ROOT, "package.json")):
    print("[MISS] not running from repo root - cd to the folder with package.json and rerun")
    sys.exit(1)
print("[OK] running from repo root")

page_path = os.path.join(ROOT, "app", "sentinel", "kpi", "page.tsx")
current = read(page_path)
get_content_cmd = page_path

# ---------------------------------------------------------------------
# 1. KpiCard - add optional formula prop, rendered as a title tooltip
# ---------------------------------------------------------------------
edit1_old = """function KpiCard({ label, value, note }: { label: string; value: string; note?: string | null }) {
  return (
    <div style={{ background: T.card, padding: "1rem 1.1rem" }}>"""
edit1_new = """function KpiCard({
  label,
  value,
  note,
  formula,
}: {
  label: string;
  value: string;
  note?: string | null;
  formula?: string;
}) {
  return (
    <div style={{ background: T.card, padding: "1rem 1.1rem" }} title={formula}>"""
current2 = apply_edit(current, edit1_old, edit1_new, "add formula prop to KpiCard", get_content_cmd)

# ---------------------------------------------------------------------
# 2. Add formula to each of the 12 call sites
# ---------------------------------------------------------------------
edits = [
    (
        """        <KpiCard
          label="Revenue (latest FY)"
          value={selfRow ? num(selfRow.revenue_cr) : "\\u2014"}
          note={formatBenchmarkNote(revenueBenchmark, "cr")}
        />""",
        """        <KpiCard
          label="Revenue (latest FY)"
          value={selfRow ? num(selfRow.revenue_cr) : "\\u2014"}
          note={formatBenchmarkNote(revenueBenchmark, "cr")}
          formula="As reported: Revenue from Operations"
        />""",
        "add formula: Revenue",
    ),
    (
        """        <KpiCard
          label="EBITDA margin"
          value={pct(selfRow?.ratios.ebitda_margin ?? null)}
          note={formatBenchmarkNote(ebitdaBenchmark, "pp")}
        />""",
        """        <KpiCard
          label="EBITDA margin"
          value={pct(selfRow?.ratios.ebitda_margin ?? null)}
          note={formatBenchmarkNote(ebitdaBenchmark, "pp")}
          formula="EBITDA / Revenue from Operations"
        />""",
        "add formula: EBITDA margin",
    ),
    (
        """        <KpiCard
          label="PAT margin"
          value={pct(selfRow?.ratios.pat_margin ?? null)}
          note={formatBenchmarkNote(patBenchmark, "pp")}
        />""",
        """        <KpiCard
          label="PAT margin"
          value={pct(selfRow?.ratios.pat_margin ?? null)}
          note={formatBenchmarkNote(patBenchmark, "pp")}
          formula="Profit After Tax / Revenue from Operations"
        />""",
        "add formula: PAT margin",
    ),
    (
        """        <KpiCard
          label="Revenue YoY"
          value={pct(selfRow?.ratios.yoy_revenue_growth ?? null)}
          note={formatBenchmarkNote(yoyBenchmark, "pp")}
        />""",
        """        <KpiCard
          label="Revenue YoY"
          value={pct(selfRow?.ratios.yoy_revenue_growth ?? null)}
          note={formatBenchmarkNote(yoyBenchmark, "pp")}
          formula="(Current Revenue - Prior Revenue) / Prior Revenue"
        />""",
        "add formula: Revenue YoY",
    ),
    (
        """        <KpiCard
          label="PAT (latest FY)"
          value={selfRow ? num(selfRow.pat_cr) : "\\u2014"}
          note={formatBenchmarkNote(patAbsBenchmark, "cr")}
        />""",
        """        <KpiCard
          label="PAT (latest FY)"
          value={selfRow ? num(selfRow.pat_cr) : "\\u2014"}
          note={formatBenchmarkNote(patAbsBenchmark, "cr")}
          formula="As reported: Profit After Tax"
        />""",
        "add formula: PAT",
    ),
    (
        """        <KpiCard
          label="PAT YoY"
          value={pct(selfRow?.ratios.yoy_pat_growth ?? null)}
          note={formatBenchmarkNote(patYoyBenchmark, "pp")}
        />""",
        """        <KpiCard
          label="PAT YoY"
          value={pct(selfRow?.ratios.yoy_pat_growth ?? null)}
          note={formatBenchmarkNote(patYoyBenchmark, "pp")}
          formula="(Current PAT - Prior PAT) / Prior PAT"
        />""",
        "add formula: PAT YoY",
    ),
    (
        """        <KpiCard
          label="Current Ratio"
          value={ratioX(selfRow?.ratios.current_ratio ?? null)}
          note={formatBenchmarkNote(currentRatioBenchmark, "x")}
        />""",
        """        <KpiCard
          label="Current Ratio"
          value={ratioX(selfRow?.ratios.current_ratio ?? null)}
          note={formatBenchmarkNote(currentRatioBenchmark, "x")}
          formula="Current Assets / Current Liabilities"
        />""",
        "add formula: Current Ratio",
    ),
    (
        """        <KpiCard
          label="Debt-to-Equity"
          value={ratioX(selfRow?.ratios.debt_to_equity ?? null)}
          note={formatBenchmarkNote(debtEquityBenchmark, "x")}
        />""",
        """        <KpiCard
          label="Debt-to-Equity"
          value={ratioX(selfRow?.ratios.debt_to_equity ?? null)}
          note={formatBenchmarkNote(debtEquityBenchmark, "x")}
          formula="Total Debt / Total Equity"
        />""",
        "add formula: Debt-to-Equity",
    ),
    (
        """        <KpiCard
          label="Inventory Days"
          value={days(selfRow?.ratios.inventory_days ?? null)}
          note={formatBenchmarkNote(inventoryDaysBenchmark, "d")}
        />""",
        """        <KpiCard
          label="Inventory Days"
          value={days(selfRow?.ratios.inventory_days ?? null)}
          note={formatBenchmarkNote(inventoryDaysBenchmark, "d")}
          formula="(Inventory / Total Expenses) x 365 - Total Expenses used as a COGS proxy"
        />""",
        "add formula: Inventory Days",
    ),
    (
        """        <KpiCard
          label="Receivable Days"
          value={days(selfRow?.ratios.receivable_days ?? null)}
          note={formatBenchmarkNote(receivableDaysBenchmark, "d")}
        />""",
        """        <KpiCard
          label="Receivable Days"
          value={days(selfRow?.ratios.receivable_days ?? null)}
          note={formatBenchmarkNote(receivableDaysBenchmark, "d")}
          formula="(Trade Receivables / Revenue from Operations) x 365"
        />""",
        "add formula: Receivable Days",
    ),
    (
        """        <KpiCard
          label="Payable Days"
          value={days(selfRow?.ratios.payable_days ?? null)}
          note={formatBenchmarkNote(payableDaysBenchmark, "d")}
        />""",
        """        <KpiCard
          label="Payable Days"
          value={days(selfRow?.ratios.payable_days ?? null)}
          note={formatBenchmarkNote(payableDaysBenchmark, "d")}
          formula="(Trade Payables / Total Expenses) x 365 - Total Expenses used as a COGS proxy"
        />""",
        "add formula: Payable Days",
    ),
    (
        """        <KpiCard
          label="Cash Conversion Cycle"
          value={days(selfRow?.ratios.cash_conversion_cycle ?? null)}
          note={formatBenchmarkNote(cccBenchmark, "d")}
        />""",
        """        <KpiCard
          label="Cash Conversion Cycle"
          value={days(selfRow?.ratios.cash_conversion_cycle ?? null)}
          note={formatBenchmarkNote(cccBenchmark, "d")}
          formula="Inventory Days + Receivable Days - Payable Days"
        />""",
        "add formula: Cash Conversion Cycle",
    ),
]

result = current2
for old, new, label in edits:
    if result is None:
        break
    result = apply_edit(result, old, new, label, get_content_cmd)

if result is not None:
    write(page_path, result)
    print("[OK] wrote " + page_path)
    brace_check(page_path, result)
else:
    print("[MISS] page.tsx NOT written - at least one edit failed above. No partial write performed.")

print("")
print("Then:  npm run build")
print("Then:  git status  /  git diff --stat")
