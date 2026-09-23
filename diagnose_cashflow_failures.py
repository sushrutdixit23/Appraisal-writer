# -*- coding: utf-8 -*-
"""
Sentinel - read-only diagnostic for the three failed Cash Flow anchors.
Prints the actual current content around each failure point so we can
see exactly what differs, instead of guessing again. Changes nothing.
Run from the repo root (the folder containing package.json).
"""
import io
import os
import sys

ROOT = os.getcwd()

if not os.path.exists(os.path.join(ROOT, "package.json")):
    print("[MISS] not running from repo root - cd to the folder with package.json and rerun")
    sys.exit(1)

def show(path, marker, context_chars=400):
    print("=" * 70)
    print(path)
    print("=" * 70)
    if not os.path.exists(path):
        print("[DIAG] file does not exist")
        return
    with io.open(path, "r", encoding="utf-8") as f:
        content = f.read()
    idx = content.find(marker)
    if idx == -1:
        print("[DIAG] marker not found at all: " + repr(marker))
        return
    start = max(0, idx - 50)
    end = min(len(content), idx + context_chars)
    print(repr(content[start:end]))
    print("")

show(
    os.path.join(ROOT, "app", "sentinel", "new-project", "page.tsx"),
    "for (const f of BALANCE_SHEET_FIELDS)",
)

show(
    os.path.join(ROOT, "app", "sentinel", "add-period", "page.tsx"),
    "for (const f of BALANCE_SHEET_FIELDS)",
)

show(
    os.path.join(ROOT, "app", "api", "sentinel", "extract", "route.ts"),
    "const FIELD_LIST",
    context_chars=600,
)
