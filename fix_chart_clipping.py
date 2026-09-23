# -*- coding: utf-8 -*-
"""
Sentinel - fixes a real geometry bug in HorizontalBarChart: the bar for
the dataset's maximum value scales to fill the entire barAreaWidth
(chartWidth - labelWidth), so its value label - positioned 8px past
the bar's end - lands past the SVG viewBox's own right edge and gets
clipped by the browser, every time, for any dataset (visible as a
missing or truncated number on the longest bar, e.g. "28,4" instead
of "28,471"). Fix: reserve a fixed gutter for the label so the bar
never fills the whole available width. TrendLineChart is untouched -
it never draws per-point value labels, so it isn't affected.
Only touches app/sentinel/lib/charts.tsx. Run from the repo root.
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

path = os.path.join(ROOT, "app", "sentinel", "lib", "charts.tsx")
current = read(path)
get_content_cmd = path

old = """  const sorted = [...data].sort((a, b) => b.value - a.value);
  const labelWidth = 150;
  const chartWidth = 640;
  const barAreaWidth = chartWidth - labelWidth;"""
new = """  const sorted = [...data].sort((a, b) => b.value - a.value);
  const labelWidth = 150;
  const chartWidth = 640;
  // Reserve a fixed gutter for the value label drawn just past each
  // bar's end - without this, a bar at (or near) the dataset's max
  // fills the entire remaining width and its label is pushed past the
  // SVG's own viewBox edge, getting clipped (a missing or truncated
  // number on the longest bar). barAreaWidth now stops short of the
  // full chart width by valueGutter, guaranteeing every label has room
  // to render fully regardless of how close a value is to the max.
  const valueGutter = 70;
  const barAreaWidth = chartWidth - labelWidth - valueGutter;"""

result = apply_edit(current, old, new, "fix bar chart label clipping", get_content_cmd)

if result is not None:
    write(path, result)
    print("[OK] wrote " + path)
    brace_check(path, result)
else:
    print("[MISS] charts.tsx NOT written - anchor failed above. No partial write performed.")

print("")
print("Then:  npm run build")
