# -*- coding: utf-8 -*-
"""
Sentinel - read-only diagnostic. Checks whether CASH_FLOW_FIELDS is
declared in new-project and add-period, and whether add-period's
ALL_FIELD_KEYS already includes it. Changes nothing.
Run from the repo root (the folder containing package.json).
"""
import io
import os
import sys

ROOT = os.getcwd()

if not os.path.exists(os.path.join(ROOT, "package.json")):
    print("[MISS] not running from repo root - cd to the folder with package.json and rerun")
    sys.exit(1)

def check(path, label):
    print("=" * 70)
    print(label + " (" + path + ")")
    print("=" * 70)
    if not os.path.exists(path):
        print("[DIAG] file does not exist")
        return None
    with io.open(path, "r", encoding="utf-8") as f:
        content = f.read()
    declared = content.count("const CASH_FLOW_FIELDS")
    referenced = content.count("CASH_FLOW_FIELDS")
    print("[DIAG] 'const CASH_FLOW_FIELDS' declarations found: " + str(declared))
    print("[DIAG] total 'CASH_FLOW_FIELDS' references (declaration + uses): " + str(referenced))
    idx = content.find("const ALL_FIELD_KEYS")
    if idx != -1:
        print("[DIAG] ALL_FIELD_KEYS line: " + repr(content[idx:idx+140]))
    return content

check(os.path.join(ROOT, "app", "sentinel", "new-project", "page.tsx"), "new-project")
print("")
check(os.path.join(ROOT, "app", "sentinel", "add-period", "page.tsx"), "add-period")
