# -*- coding: utf-8 -*-
"""
Sentinel - Tier 1: Drill from KPI/Health into related investigations.
Adds a "View Investigations" link on the Business Health card (KPI
Dashboard) pointing to /sentinel?workspace=<id>, and makes Investigation
Queue read that param to auto-scroll to and highlight the matching
company's card - whether or not an investigation exists there yet.
Touches:
  app/sentinel/kpi/page.tsx
  app/sentinel/page.tsx
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

# ---------------------------------------------------------------------
# 1. KPI Dashboard - add the drill-through link on the Health card
# ---------------------------------------------------------------------
kpi_path = os.path.join(ROOT, "app", "sentinel", "kpi", "page.tsx")
kpi_current = read(kpi_path)
kpi_get_content = kpi_path

kpi_old = """            {healthScore.categories.map((c) => (
              <HealthChip key={c.key} category={c} />
            ))}
          </div>
        </div>
      )}"""
kpi_new = """            {healthScore.categories.map((c) => (
              <HealthChip key={c.key} category={c} />
            ))}
          </div>
          <a
            href={`/sentinel?workspace=${selected.id}`}
            style={{
              fontSize: "0.78rem",
              color: T.accent,
              textDecoration: "none",
              marginTop: "1rem",
              display: "inline-block",
            }}
          >
            View Investigations for {selected.company_name} &gt;
          </a>
        </div>
      )}"""
kpi_result = apply_edit(kpi_current, kpi_old, kpi_new, "kpi/page.tsx: add drill-through link", kpi_get_content)
if kpi_result is not None:
    write(kpi_path, kpi_result)
    print("[OK] wrote " + kpi_path)
    brace_check(kpi_path, kpi_result)
else:
    print("[MISS] kpi/page.tsx NOT written - anchor failed above. No partial write performed.")

# ---------------------------------------------------------------------
# 2. Investigation Queue - read ?workspace= and highlight + scroll
# ---------------------------------------------------------------------
queue_path = os.path.join(ROOT, "app", "sentinel", "page.tsx")
queue_current = read(queue_path)
queue_get_content = queue_path

q_edit1_old = """import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";"""
q_edit1_new = """import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";"""
queue2 = apply_edit(queue_current, q_edit1_old, q_edit1_new, "page.tsx: add useSearchParams import", queue_get_content)

q_edit2_old = """export default function InvestigationQueuePage() {
  const router = useRouter();"""
q_edit2_new = """export default function InvestigationQueuePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightWorkspaceId = searchParams.get("workspace");"""
queue3 = None
if queue2 is not None:
    queue3 = apply_edit(queue2, q_edit2_old, q_edit2_new, "page.tsx: read workspace query param", queue_get_content)

q_edit3_old = """        return (
          <div
            key={workspaceId}
            style={{
              background: T.card,
              border: `1px solid ${T.rule}`,
              borderRadius: 3,
              padding: "1.4rem 1.7rem",
              marginBottom: "1rem",
              opacity: inv?.status === "archived" ? 0.6 : 1,
            }}
          >"""
q_edit3_new = """        const isHighlighted = workspaceId === highlightWorkspaceId;

        return (
          <div
            key={workspaceId}
            ref={(el) => {
              if (isHighlighted) {
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
              }
            }}
            style={{
              background: T.card,
              border: `1px solid ${isHighlighted ? T.accent : T.rule}`,
              borderRadius: 3,
              padding: "1.4rem 1.7rem",
              marginBottom: "1rem",
              opacity: inv?.status === "archived" ? 0.6 : 1,
            }}
          >"""
queue4 = None
if queue3 is not None:
    queue4 = apply_edit(queue3, q_edit3_old, q_edit3_new, "page.tsx: highlight + scroll matching card", queue_get_content)

if queue4 is not None:
    write(queue_path, queue4)
    print("[OK] wrote " + queue_path)
    brace_check(queue_path, queue4)
else:
    print("[MISS] page.tsx NOT written - at least one edit failed above. No partial write performed.")

print("")
print("Then:  npm run build")
print("Then:  git status  /  git diff --stat")
