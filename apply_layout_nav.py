# -*- coding: utf-8 -*-
"""
Sentinel - navigation / information hierarchy pass. Full-file rewrite
of layout.tsx (not a diff), since the nav structure is being grouped,
not just extended. Adds two real, already-built pages that were
missing from the nav entirely - /sentinel/home (portfolio landing
screen) and /sentinel/reviews (Review Cycles) - and groups all seven
destinations into Portfolio (no single-company selector: Home,
Executive Dashboard) and Company (pick a company, see its detail:
Investigation Queue, Review Cycles, Financial Statements, KPI
Dashboard, Deep Analysis). Also fixes active-nav-highlight logic to
correctly handle nested routes (/sentinel/reviews/<id> now correctly
highlights "Review Cycles", which the old exact-match check never did)
without breaking the bare /sentinel root, which needs to stay an exact
match only - verified against every real route in the app before
delivery, including that exact nested-route case.
/sentinel/data-entry (a legacy manual-entry page, no theme tokens, no
Cash Flow fields, a different API route than New Project) is
deliberately NOT added to the nav - it looks like a deletion candidate,
which is a separate decision from this pass.
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

path = os.path.join(ROOT, "app", "sentinel", "layout.tsx")
if not os.path.exists(path):
    print("[MISS] " + path + " not found - expected an existing file to overwrite")
    sys.exit(1)

with io.open(path, "r", encoding="utf-8") as f:
    old_content = f.read()
old_size = len(old_content.encode("utf-8"))
print("[OK] found existing file, current size: " + str(old_size) + " bytes")

NEW_CONTENT = '"use client";\n\n// Sentinel - section layout. Dark #111111 brand rail on the left\n// (Zyntask parent brand + Sentinel product name + section nav), sandstone\n// canvas on the right. Scoped to /sentinel/* only - nothing here leaks\n// into the rest of the site\'s visual identity.\n//\n// Navigation pass: the nav array was missing two real, already-built\n// pages entirely - /sentinel/home (a portfolio-wide "what needs\n// attention" landing screen, per its own header comment explicitly\n// left the routing decision of whether it replaces the /sentinel root\n// open for later) and /sentinel/reviews (Review Cycles, previously\n// reachable only via a buried "Start one" link inside Add Period).\n// Both are added here. /sentinel/data-entry is a legacy manual-entry\n// page (no theme tokens, no Cash Flow fields, a different API route\n// than New Project) and is deliberately NOT added - it looks like a\n// deletion candidate, not a missing nav link, and that\'s a separate\n// decision from this pass.\n//\n// Grouped into Portfolio (no single-company selector - Home and\n// Executive Dashboard show everything across every company at once)\n// and Company (every other page\'s core interaction is "pick a company,\n// see its detail"). This is an objective split, not an arbitrary one.\n//\n// Active-state highlighting previously used an exact pathname match,\n// which would never highlight a nested route - visiting\n// /sentinel/reviews/<id> would not highlight "Review Cycles". isActive\n// below allows prefix-matching for nested routes while keeping the bare\n// /sentinel root (Investigation Queue) as an exact match only, since a\n// naive prefix match there would incorrectly highlight it on every\n// other Sentinel page too (they all start with "/sentinel/").\n\nimport Link from "next/link";\nimport { usePathname } from "next/navigation";\nimport { SANS, SERIF, T } from "./lib/theme";\n\nconst NAV_GROUPS: { label: string; items: { href: string; label: string }[] }[] = [\n  {\n    label: "Portfolio",\n    items: [\n      { href: "/sentinel/home", label: "Home" },\n      { href: "/sentinel/executive", label: "Executive Dashboard" },\n    ],\n  },\n  {\n    label: "Company",\n    items: [\n      { href: "/sentinel", label: "Investigation Queue" },\n      { href: "/sentinel/reviews", label: "Review Cycles" },\n      { href: "/sentinel/statements", label: "Financial Statements" },\n      { href: "/sentinel/kpi", label: "KPI Dashboard" },\n      { href: "/sentinel/analysis", label: "Deep Analysis" },\n    ],\n  },\n];\n\nfunction isActive(pathname: string, href: string): boolean {\n  if (href === "/sentinel") return pathname === "/sentinel";\n  return pathname === href || pathname.startsWith(href + "/");\n}\n\nexport default function SentinelLayout({\n  children,\n}: {\n  children: React.ReactNode;\n}) {\n  const pathname = usePathname();\n\n  return (\n    <div\n      style={{\n        display: "flex",\n        minHeight: "100vh",\n        background: T.background,\n        fontFamily: SANS,\n        color: T.ink,\n      }}\n    >\n      <style>{`\n        @import url("https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&family=IBM+Plex+Sans:wght@400;500;600&display=swap");\n      `}</style>\n\n      {/* Dark brand rail */}\n      <aside\n        style={{\n          width: 232,\n          flexShrink: 0,\n          background: T.sidebar,\n          padding: "1.6rem 1.2rem",\n          display: "flex",\n          flexDirection: "column",\n        }}\n      >\n        <div\n          style={{\n            paddingBottom: "1rem",\n            borderBottom: "1px solid rgba(237,231,220,0.16)",\n            marginBottom: "1rem",\n          }}\n        >\n          <Link href="/" style={{ textDecoration: "none" }}>\n            <p\n              style={{\n                fontSize: "0.62rem",\n                fontWeight: 500,\n                letterSpacing: "0.14em",\n                textTransform: "uppercase",\n                color: T.sidebarTextMuted,\n                margin: "0 0 0.15rem 0",\n              }}\n            >\n              Zyntask\n            </p>\n          </Link>\n          <p\n            style={{\n              fontFamily: SERIF,\n              fontSize: "1.35rem",\n              fontWeight: 500,\n              color: T.sidebarText,\n              margin: 0,\n            }}\n          >\n            Sentinel\n          </p>\n        </div>\n\n        <Link\n          href="/sentinel/new-project"\n          style={{\n            display: "block",\n            textAlign: "center",\n            textDecoration: "none",\n            fontSize: "0.82rem",\n            fontWeight: 600,\n            color: T.sidebar,\n            background: T.accent,\n            padding: "0.6rem 0.7rem",\n            borderRadius: 3,\n            marginBottom: "0.5rem",\n          }}\n        >\n          + New Project\n        </Link>\n\n        <Link\n          href="/sentinel/add-period"\n          style={{\n            display: "block",\n            textAlign: "center",\n            textDecoration: "none",\n            fontSize: "0.76rem",\n            fontWeight: 500,\n            color: T.sidebarTextMuted,\n            border: "1px solid rgba(237,231,220,0.22)",\n            padding: "0.5rem 0.7rem",\n            borderRadius: 3,\n            marginBottom: "1.2rem",\n          }}\n        >\n          Manage Periods\n        </Link>\n\n        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>\n          {NAV_GROUPS.map((group, groupIndex) => (\n            <div key={group.label} style={{ marginTop: groupIndex === 0 ? 0 : "1.1rem" }}>\n              <p\n                style={{\n                  fontSize: "0.62rem",\n                  fontWeight: 500,\n                  letterSpacing: "0.1em",\n                  textTransform: "uppercase",\n                  color: T.sidebarTextMuted,\n                  margin: "0 0 0.4rem 0.7rem",\n                }}\n              >\n                {group.label}\n              </p>\n              {group.items.map((item) => {\n                const active = isActive(pathname, item.href);\n                return (\n                  <Link\n                    key={item.href}\n                    href={item.href}\n                    style={{\n                      display: "block",\n                      textDecoration: "none",\n                      fontSize: "0.86rem",\n                      fontWeight: active ? 600 : 400,\n                      color: active ? T.sidebarText : T.sidebarTextMuted,\n                      padding: "0.55rem 0.7rem",\n                      background: active ? "rgba(164,117,81,0.22)" : "transparent",\n                      borderLeft: active\n                        ? `2px solid ${T.accent}`\n                        : "2px solid transparent",\n                    }}\n                  >\n                    {item.label}\n                  </Link>\n                );\n              })}\n            </div>\n          ))}\n        </nav>\n\n        <p\n          style={{\n            marginTop: "auto",\n            fontSize: "0.68rem",\n            lineHeight: 1.5,\n            color: T.sidebarTextMuted,\n          }}\n        >\n          AI-drafted, human-approved.\n          <br />\n          Nothing is final without sign-off.\n        </p>\n      </aside>\n\n      {/* Content canvas */}\n      <main\n        style={{\n          flex: 1,\n          minWidth: 0,\n          display: "flex",\n          justifyContent: "center",\n          padding: "2.2rem 2.8rem",\n        }}\n      >\n        <div style={{ width: "100%", maxWidth: 1080 }}>{children}</div>\n      </main>\n    </div>\n  );\n}\n'

with io.open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(NEW_CONTENT)

new_size = len(NEW_CONTENT.encode("utf-8"))
print("[OK] wrote " + path + " (" + str(new_size) + " bytes, was " + str(old_size) + ")")

opens = NEW_CONTENT.count("{")
closes = NEW_CONTENT.count("}")
if opens == closes:
    print("[OK] brace check: " + str(opens) + " open / " + str(closes) + " close")
else:
    print("[MISS] brace mismatch: " + str(opens) + " open / " + str(closes) + " close")

print("")
print("Then:  npm run build")
print("Then:  git diff --stat")
