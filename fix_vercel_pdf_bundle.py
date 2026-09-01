# -*- coding: utf-8 -*-
"""
Sentinel - fix the Vercel PDF export crash. Adds outputFileTracingIncludes
so pdfkit's dynamically-required standard font files get bundled into the
deployed function for the PDF export route.
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

path = os.path.join(ROOT, "next.config.ts")
if not os.path.exists(path):
    print("[MISS] next.config.ts not found at " + path)
    sys.exit(1)

with io.open(path, "r", encoding="utf-8") as f:
    content = f.read()

old = '''const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
};'''

new = '''const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // Vercel's build-time file tracer cannot see pdfkit's dynamic
  // require() calls for its standard font files (Helvetica.cjs etc.),
  // so those files get silently excluded from the deployed function
  // bundle unless explicitly included here. Scoped to the PDF export
  // route only, not applied globally.
  outputFileTracingIncludes: {
    "/api/sentinel/export/pdf": ["./node_modules/pdfkit/js/**/*"],
  },
};'''

count = content.count(old)
if count == 0:
    print("[MISS] anchor not found. Run: Get-Content \"" + path + "\" and paste it back.")
    sys.exit(1)
if count > 1:
    print("[MISS] anchor found " + str(count) + " times, expected 1. Run: Get-Content \"" + path + "\" and paste it back.")
    sys.exit(1)

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
print("Then:  git add next.config.ts  &&  git commit -m \"fix: bundle pdfkit standard fonts for Vercel\"")
print("Then:  git push  (redeploy, then retest Export PDF on the live site)")
