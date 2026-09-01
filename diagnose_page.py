# -*- coding: utf-8 -*-
"""
Sentinel - read-only diagnostic. Finds exactly where the real file
diverges from the expected anchor text, character by character, so we
stop guessing at what's different. Changes nothing.
Run from the repo root (the folder containing package.json).
"""
import io
import os
import sys

ROOT = os.getcwd()

if not os.path.exists(os.path.join(ROOT, "package.json")):
    print("[MISS] not running from repo root - cd to the folder with package.json and rerun")
    sys.exit(1)

path = os.path.join(ROOT, "app", "sentinel", "kpi", "page.tsx")
with io.open(path, "r", encoding="utf-8") as f:
    content = f.read()

MIDDLE_DOT_ESCAPE = "\\u00b7"  # the literal 6-char text: backslash u 0 0 b 7

expected = (
    "function formatIndustryLine(b: Benchmark | null, isRatio: boolean): string | null {\n"
    "  if (!b || b.industryAverage == null || !b.industryLeader) return null;\n"
    "  const fmt = (v: number) =>\n"
    "    isRatio ? `${(v * 100).toFixed(1)}%` : v.toLocaleString(\"en-IN\", { maximumFractionDigits: 0 });\n"
    "  return `Industry avg ${fmt(b.industryAverage)} " + MIDDLE_DOT_ESCAPE + " Leader ${b.industryLeader.company_name} (${fmt(\n"
    "    b.industryLeader.value\n"
    "  )})`;\n"
    "}\n"
    "\n"
    "export default function KpiDashboardPage() {"
)

marker = "function formatIndustryLine("
idx = content.find(marker)
if idx == -1:
    print("[DIAG] Could not even find 'function formatIndustryLine(' in the file at all.")
    idx2 = content.find("formatIndustryLine")
    if idx2 != -1:
        print(repr(content[max(0, idx2 - 100):idx2 + 300]))
    sys.exit(0)

actual_slice = content[idx:idx + len(expected) + 50]

print("[DIAG] Found the function. Comparing character by character against the expected anchor...")
print("")

min_len = min(len(expected), len(actual_slice))
diverge_at = None
for i in range(min_len):
    if expected[i] != actual_slice[i]:
        diverge_at = i
        break

if diverge_at is None:
    if len(expected) == len(actual_slice):
        print("[DIAG] No divergence found - texts appear IDENTICAL in the compared range.")
        print("[DIAG] If the edit still fails, the divergence must be OUTSIDE this specific block.")
    else:
        print("[DIAG] One string is a prefix of the other. expected len=" + str(len(expected)) + " actual len=" + str(len(actual_slice)))
else:
    context_start = max(0, diverge_at - 40)
    print("[DIAG] DIVERGENCE FOUND at character position " + str(diverge_at) + " (relative to start of the function)")
    print("")
    print("[DIAG] Expected (repr, with context before/after):")
    print(repr(expected[context_start:diverge_at + 40]))
    print("")
    print("[DIAG] Actual file has (repr, with context before/after):")
    print(repr(actual_slice[context_start:diverge_at + 40]))
    print("")
    print("[DIAG] The exact differing character:")
    print("  expected: " + repr(expected[diverge_at]) + "  (code point " + str(ord(expected[diverge_at])) + ")")
    if diverge_at < len(actual_slice):
        print("  actual:   " + repr(actual_slice[diverge_at]) + "  (code point " + str(ord(actual_slice[diverge_at])) + ")")
    else:
        print("  actual:   <end of string>")

print("")
print("[DIAG] Full repr of the actual file's version of this block, for reference:")
print(repr(actual_slice[:len(expected) + 20]))
