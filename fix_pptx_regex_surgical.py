# -*- coding: utf-8 -*-
"""
Sentinel - surgical fix for the broken extractVerdict function left by
the previous attempt (a regex-escaping mistake produced a literal
embedded newline inside a regex literal, breaking the build). Replaces
ONLY that function body with a plain-string-method version - no regex,
no backslash escaping anywhere, eliminating this whole bug class.
Everything else in the file (already confirmed correct via your last
paste) is left untouched.
Run from the repo root (the folder containing package.json).
"""
import io
import os
import sys

ROOT = os.getcwd()

if not os.path.exists(os.path.join(ROOT, "package.json")):
    print("[MISS] not running from repo root - cd to the folder with package.json and rerun")
    sys.exit(1)
print("[OK] running from repo root")

path = os.path.join(ROOT, "app", "api", "sentinel", "export", "pptx", "route.ts")
if not os.path.exists(path):
    print("[MISS] " + path + " not found")
    sys.exit(1)

with io.open(path, "r", encoding="utf-8") as f:
    content = f.read()

old = 'function extractVerdict(narrative: string): { verdict: string | null; body: string } {\n  const match = narrative.match(/^\\*\\*(.+?)\\*\\*\\s*\n*/);\n  if (match) {\n    return { verdict: match[1], body: narrative.slice(match[0].length).trim() };\n  }\n  return { verdict: null, body: narrative };\n}'

new = 'function extractVerdict(narrative: string): { verdict: string | null; body: string } {\n  if (!narrative.startsWith("**")) {\n    return { verdict: null, body: narrative };\n  }\n  const closeIdx = narrative.indexOf("**", 2);\n  if (closeIdx === -1) {\n    return { verdict: null, body: narrative };\n  }\n  const verdict = narrative.slice(2, closeIdx);\n  const body = narrative.slice(closeIdx + 2).trim();\n  return { verdict, body };\n}'

count = content.count(old)
if count == 0:
    print("[MISS] extractVerdict anchor not found. Run: Get-Content \"" + path + "\" and paste it back.")
    sys.exit(1)
if count > 1:
    print("[MISS] extractVerdict anchor found " + str(count) + " times, expected 1. Run: Get-Content \"" + path + "\" and paste it back.")
    sys.exit(1)
print("[OK] found broken extractVerdict, replacing")

content = content.replace(old, new, 1)
with io.open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)

opens = content.count("{")
closes = content.count("}")
if opens == closes:
    print("[OK] brace check " + path + ": " + str(opens) + " open / " + str(closes) + " close")
else:
    print("[MISS] brace mismatch: " + str(opens) + " open / " + str(closes) + " close")

print("[OK] wrote " + path)
print("")
print("Then:  npm run build")
