# -*- coding: utf-8 -*-
"""
Sentinel - fix NextResponse Buffer type error in the PDF export route.
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

path = os.path.join(ROOT, "app", "api", "sentinel", "export", "pdf", "route.ts")
if not os.path.exists(path):
    print("[MISS] " + path + " not found - run: Get-Content \"" + path + "\" and paste it back")
    sys.exit(1)

with io.open(path, "r", encoding="utf-8") as f:
    content = f.read()

old = "return new NextResponse(buffer, {"
new = "return new NextResponse(new Uint8Array(buffer), {"

count = content.count(old)
if count != 1:
    print("[MISS] anchor found " + str(count) + " times in " + path + " (expected 1) - run: Get-Content \"" + path + "\" and paste it back")
    sys.exit(1)

content = content.replace(old, new, 1)
with io.open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)

print("[OK] fixed Buffer type in " + path)
print("")
print("Now run:  npm run build")
