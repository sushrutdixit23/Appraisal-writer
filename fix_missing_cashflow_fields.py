# -*- coding: utf-8 -*-
"""
Sentinel - Cash Flow: adds the missing CASH_FLOW_FIELDS array
declaration to new-project and add-period (confirmed absent by the
prior diagnostic - the very first Cash Flow script never actually wrote
either file, since a later edit in that same run failed and the
all-or-nothing write was correctly aborted; a later fix-up script then
added a loop referencing this array into the still-original file,
producing the "Cannot find name 'CASH_FLOW_FIELDS'" build error).
Also fixes add-period's ALL_FIELD_KEYS, confirmed still missing
CASH_FLOW_FIELDS from that same aborted first run.
Idempotent: skips a file's array-declaration insert if it is already
present, so this is safe to re-run.
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

BALANCE_SHEET_BLOCK = '''const BALANCE_SHEET_FIELDS: {
  key: string;
  label: string;
}[] = [
  { key: "current_assets", label: "Current Assets" },
  { key: "current_liabilities", label: "Current Liabilities" },
  { key: "inventory", label: "Inventory" },
  { key: "trade_receivables", label: "Trade Receivables" },
  { key: "trade_payables", label: "Trade Payables" },
  { key: "total_debt", label: "Total Debt" },
  { key: "total_equity", label: "Total Equity" },
];'''

CASH_FLOW_BLOCK = '''

// Cash Flow fields - optional, feed the Health Engine's Cash Flow
// category (operating cash flow vs. PAT). capex is captured even
// though the current Cash Flow health check doesn't use it yet, since
// it's part of the same statement section and cheap to collect now
// rather than needing a second pass through this filing later.
const CASH_FLOW_FIELDS: {
  key: string;
  label: string;
}[] = [
  { key: "cash_from_operations", label: "Cash from Operations" },
  { key: "cash_from_investing", label: "Cash from Investing" },
  { key: "cash_from_financing", label: "Cash from Financing" },
  { key: "capex", label: "Capital Expenditure" },
];'''

# =======================================================================
# FILE 1 of 2: app/sentinel/new-project/page.tsx
# =======================================================================
print("")
print("--- new-project/page.tsx ---")
np_path = os.path.join(ROOT, "app", "sentinel", "new-project", "page.tsx")
np_current = read(np_path)
np_get_content = np_path

if "const CASH_FLOW_FIELDS" in np_current:
    print("[SKIP] CASH_FLOW_FIELDS already declared - nothing to do")
else:
    np2 = apply_edit(
        np_current,
        BALANCE_SHEET_BLOCK,
        BALANCE_SHEET_BLOCK + CASH_FLOW_BLOCK,
        "add missing CASH_FLOW_FIELDS declaration",
        np_get_content,
    )
    if np2 is not None:
        write(np_path, np2)
        print("[OK] wrote " + np_path)
        brace_check(np_path, np2)
    else:
        print("[MISS] new-project/page.tsx NOT written - anchor failed above.")

# =======================================================================
# FILE 2 of 2: app/sentinel/add-period/page.tsx
# =======================================================================
print("")
print("--- add-period/page.tsx ---")
ap_path = os.path.join(ROOT, "app", "sentinel", "add-period", "page.tsx")
ap_current = read(ap_path)
ap_get_content = ap_path

if "const CASH_FLOW_FIELDS" in ap_current:
    print("[SKIP] CASH_FLOW_FIELDS already declared - nothing to do")
    ap_after_declare = ap_current
else:
    ap_after_declare = apply_edit(
        ap_current,
        BALANCE_SHEET_BLOCK,
        BALANCE_SHEET_BLOCK + CASH_FLOW_BLOCK,
        "add missing CASH_FLOW_FIELDS declaration",
        ap_get_content,
    )

if ap_after_declare is not None:
    old_all_keys = "const ALL_FIELD_KEYS = [...STATEMENT_FIELDS, ...BALANCE_SHEET_FIELDS].map((f) => f.key);"
    new_all_keys = "const ALL_FIELD_KEYS = [...STATEMENT_FIELDS, ...BALANCE_SHEET_FIELDS, ...CASH_FLOW_FIELDS].map((f) => f.key);"
    if old_all_keys not in ap_after_declare:
        if new_all_keys in ap_after_declare:
            print("[SKIP] ALL_FIELD_KEYS already includes CASH_FLOW_FIELDS - nothing to do")
            ap_final = ap_after_declare
        else:
            print("[MISS] ALL_FIELD_KEYS: neither old nor new form found. Run: Get-Content \"" + ap_get_content + "\" and paste it back.")
            ap_final = None
    else:
        ap_final = apply_edit(
            ap_after_declare,
            old_all_keys,
            new_all_keys,
            "extend ALL_FIELD_KEYS with CASH_FLOW_FIELDS",
            ap_get_content,
        )

    if ap_final is not None:
        write(ap_path, ap_final)
        print("[OK] wrote " + ap_path)
        brace_check(ap_path, ap_final)
    else:
        print("[MISS] add-period/page.tsx NOT written - at least one step failed above.")
else:
    print("[MISS] add-period/page.tsx NOT written - declaration insert failed above.")

print("")
print("=== Summary ===")
print("Then:  npm run build")
