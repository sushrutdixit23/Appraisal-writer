# -*- coding: utf-8 -*-
"""
Sentinel - Cash Flow fix-up: completes the two remaining record-wiring
edits (new-project, add-period) and the extraction FIELD_LIST edit that
failed on the first pass. Anchors are narrowed to avoid a comment block
between the Balance Sheet loop and the insert call that the original
anchors didn't account for, and to avoid the FIELD_LIST's preceding
comment entirely. health.ts and the CASH_FLOW_FIELDS array declarations
in new-project/add-period already succeeded on the first run and are
left untouched here.
Run from the repo root (the folder containing package.json).
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

# =======================================================================
# FILE 1 of 3: app/sentinel/new-project/page.tsx
# =======================================================================
print("")
print("--- new-project/page.tsx ---")
np_path = os.path.join(ROOT, "app", "sentinel", "new-project", "page.tsx")
np_current = read(np_path)
np_get_content = np_path

np_old = '''    for (const f of BALANCE_SHEET_FIELDS) {
      const raw = values[f.key];
      record[f.key] = raw != null && raw !== "" ? parseFloat(raw) : null;
    }'''
np_new = '''    for (const f of BALANCE_SHEET_FIELDS) {
      const raw = values[f.key];
      record[f.key] = raw != null && raw !== "" ? parseFloat(raw) : null;
    }
    for (const f of CASH_FLOW_FIELDS) {
      const raw = values[f.key];
      record[f.key] = raw != null && raw !== "" ? parseFloat(raw) : null;
    }'''
np2 = apply_edit(np_current, np_old, np_new, "wire cash flow fields into insert record", np_get_content)

if np2 is not None:
    write(np_path, np2)
    print("[OK] wrote " + np_path)
    brace_check(np_path, np2)
else:
    print("[MISS] new-project/page.tsx NOT written - anchor failed above.")

# =======================================================================
# FILE 2 of 3: app/sentinel/add-period/page.tsx
# =======================================================================
print("")
print("--- add-period/page.tsx ---")
ap_path = os.path.join(ROOT, "app", "sentinel", "add-period", "page.tsx")
ap_current = read(ap_path)
ap_get_content = ap_path

ap_old = '''    for (const f of BALANCE_SHEET_FIELDS) {
      const raw = values[f.key];
      record[f.key] = raw != null && raw !== "" ? parseFloat(raw) : null;
    }'''
ap_new = '''    for (const f of BALANCE_SHEET_FIELDS) {
      const raw = values[f.key];
      record[f.key] = raw != null && raw !== "" ? parseFloat(raw) : null;
    }
    for (const f of CASH_FLOW_FIELDS) {
      const raw = values[f.key];
      record[f.key] = raw != null && raw !== "" ? parseFloat(raw) : null;
    }'''
ap2 = apply_edit(ap_current, ap_old, ap_new, "wire cash flow fields into insert/update record", ap_get_content)

if ap2 is not None:
    write(ap_path, ap2)
    print("[OK] wrote " + ap_path)
    brace_check(ap_path, ap2)
else:
    print("[MISS] add-period/page.tsx NOT written - anchor failed above.")

# =======================================================================
# FILE 3 of 3: app/api/sentinel/extract/route.ts
# =======================================================================
print("")
print("--- extract/route.ts ---")
ex_path = os.path.join(ROOT, "app", "api", "sentinel", "extract", "route.ts")
ex_current = read(ex_path)
ex_get_content = ex_path

ex_old = '''const FIELD_LIST = [
  "revenue_from_operations",
  "other_income",
  "total_income",
  "total_expenses",
  "ebitda",
  "depreciation_amortisation",
  "finance_costs",
  "exceptional_items",
  "profit_before_tax",
  "tax_expense",
  "profit_after_tax",
  "current_assets",
  "current_liabilities",
  "inventory",
  "trade_receivables",
  "trade_payables",
  "total_debt",
  "total_equity",
];'''
ex_new = '''const FIELD_LIST = [
  "revenue_from_operations",
  "other_income",
  "total_income",
  "total_expenses",
  "ebitda",
  "depreciation_amortisation",
  "finance_costs",
  "exceptional_items",
  "profit_before_tax",
  "tax_expense",
  "profit_after_tax",
  "current_assets",
  "current_liabilities",
  "inventory",
  "trade_receivables",
  "trade_payables",
  "total_debt",
  "total_equity",
  "cash_from_operations",
  "cash_from_investing",
  "cash_from_financing",
  "capex",
];'''
ex2 = apply_edit(ex_current, ex_old, ex_new, "add cash flow fields to FIELD_LIST", ex_get_content)

if ex2 is not None:
    write(ex_path, ex2)
    print("[OK] wrote " + ex_path)
    brace_check(ex_path, ex2)
else:
    print("[MISS] extract/route.ts NOT written - anchor failed above.")

print("")
print("=== Summary ===")
print("Then:  npm run build")
print("Then:  git status  /  git diff --stat")
