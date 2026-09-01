# -*- coding: utf-8 -*-
"""
Sentinel - KPI Dashboard Phase B: Quick Financial Summary. Deterministic
- not AI prose. Stitches together the Health Engine detail sentences
already computed for Growth/Profitability/Liquidity/Leverage/Working
Capital (in that priority order, skipping any category with no data)
into a short paragraph. Never generates new wording - reuses exactly
what the Business Health card itself already computes and shows.
Only touches app/sentinel/kpi/page.tsx. Run from the repo root.
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

page_path = os.path.join(ROOT, "app", "sentinel", "kpi", "page.tsx")
current = read(page_path)
get_content_cmd = page_path

edit1_old = """import { computeHealthScore, type HealthCategory, type HealthStatus } from "../lib/health";"""
edit1_new = """import { computeHealthScore, type HealthCategory, type HealthScore, type HealthStatus } from "../lib/health";"""
current2 = apply_edit(current, edit1_old, edit1_new, "add HealthScore import", get_content_cmd)

edit2_old = """function RankStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        style={{
          fontSize: "0.62rem",
          fontWeight: 500,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: T.inkSoft,
          margin: "0 0 0.3rem 0",
        }}
      >
        {label}
      </p>
      <p style={{ fontFamily: SERIF, fontSize: "1.1rem", fontWeight: 500, color: T.ink, margin: 0 }}>
        {value}
      </p>
    </div>
  );
}

export default function KpiDashboardPage() {"""
edit2_new = """function RankStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        style={{
          fontSize: "0.62rem",
          fontWeight: 500,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: T.inkSoft,
          margin: "0 0 0.3rem 0",
        }}
      >
        {label}
      </p>
      <p style={{ fontFamily: SERIF, fontSize: "1.1rem", fontWeight: 500, color: T.ink, margin: 0 }}>
        {value}
      </p>
    </div>
  );
}

// Quick Financial Summary - deterministic, not AI prose. Stitches
// together the already-computed Health Engine detail sentences for the
// categories that matter most (same convention as everywhere else in
// Sentinel: reuse what is already computed rather than generate new
// text), so this can never say something the Business Health card
// itself would not also support.
function buildQuickSummary(healthScore: HealthScore): string | null {
  const priorityOrder = ["growth", "profitability", "liquidity", "leverage", "working_capital"];
  const sentences = priorityOrder
    .map((key) => healthScore.categories.find((c) => c.key === key))
    .filter((c): c is HealthCategory => c != null && c.detail != null)
    .slice(0, 3)
    .map((c) => {
      const d = c.detail as string;
      return d.charAt(0).toUpperCase() + d.slice(1);
    });
  if (sentences.length === 0) return null;
  return sentences.join(". ") + ".";
}

export default function KpiDashboardPage() {"""
current3 = None
if current2 is not None:
    current3 = apply_edit(current2, edit2_old, edit2_new, "add buildQuickSummary function", get_content_cmd)

edit3_old = """  const healthScore = latestOwnStatement
    ? computeHealthScore(latestOwnStatement, priorOwnStatement, selected.sector)
    : null;

  const revenueTrend = buildTimeSeries(selected, statements, "revenue_from_operations");"""
edit3_new = """  const healthScore = latestOwnStatement
    ? computeHealthScore(latestOwnStatement, priorOwnStatement, selected.sector)
    : null;
  const quickSummary = healthScore ? buildQuickSummary(healthScore) : null;

  const revenueTrend = buildTimeSeries(selected, statements, "revenue_from_operations");"""
current4 = None
if current3 is not None:
    current4 = apply_edit(current3, edit3_old, edit3_new, "compute quickSummary", get_content_cmd)

edit4_old = """          <RankStat
            label="Gap to Closest Peer"
            value={formatBenchmarkNote(rankingBenchmark, rankingDef.unit) ?? "\\u2014"}
          />
        </div>
      </div>
    </div>
  );
}"""
edit4_new = """          <RankStat
            label="Gap to Closest Peer"
            value={formatBenchmarkNote(rankingBenchmark, rankingDef.unit) ?? "\\u2014"}
          />
        </div>
      </div>

      {quickSummary && (
        <div
          style={{
            background: T.card,
            border: `1px solid ${T.rule}`,
            borderRadius: 3,
            padding: "1.4rem 1.6rem",
            marginBottom: "1.4rem",
          }}
        >
          <p
            style={{
              fontSize: "0.7rem",
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: T.inkSoft,
              margin: "0 0 0.8rem 0",
            }}
          >
            Quick Financial Summary
          </p>
          <p style={{ fontSize: "0.92rem", lineHeight: 1.6, color: T.ink, margin: 0 }}>
            {quickSummary}
          </p>
        </div>
      )}
    </div>
  );
}"""
current5 = None
if current4 is not None:
    current5 = apply_edit(current4, edit4_old, edit4_new, "render Quick Financial Summary card", get_content_cmd)

if current5 is not None:
    write(page_path, current5)
    print("[OK] wrote " + page_path)
    brace_check(page_path, current5)
else:
    print("[MISS] page.tsx NOT written - at least one edit failed above. No partial write performed.")

print("")
print("Then:  npm run build")
print("Then:  git status  /  git diff --stat")
