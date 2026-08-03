# -*- coding: utf-8 -*-
"""
Sentinel — Health Engine build script. Creates app/sentinel/lib/health.ts
and wires a Business Health card into the top of the KPI Dashboard.
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

def brace_balance(path, content):
    opens = content.count("{")
    closes = content.count("}")
    status = "OK" if opens == closes else "MISMATCH"
    print("  brace check " + path + ": { " + str(opens) + "  } " + str(closes) + "  -> " + status)
    return opens == closes

def unique_replace(content, old, new, label):
    count = content.count(old)
    if count != 1:
        print("!! ANCHOR FAILED (" + label + "): found " + str(count) + " occurrences, expected 1. Aborting this file.")
        return None
    return content.replace(old, new, 1)

# ---------------------------------------------------------------------
# 1. Create app/sentinel/lib/health.ts
# ---------------------------------------------------------------------
health_path = os.path.join(ROOT, "app", "sentinel", "lib", "health.ts")

HEALTH_TS = '''// Sentinel — Business Health Engine (Phase 2 of the locked V1 roadmap).
// Turns the ratios engine.ts/config.ts already compute into a single
// Healthy/Watch/Concern/Critical status per category, reusing the exact
// same threshold values anomaly.ts already checks against
// (current_ratio_min, debt_equity_max, inventory_days_max,
// receivable_days_max, yoy_swing_pct) rather than inventing a second,
// possibly-inconsistent set of numbers for the same ratio. A category a
// company hasn't supplied the underlying data for (Balance Sheet fields,
// or — for Cash Flow/Capital Allocation — fields this schema doesn't
// collect at all yet) resolves to "no_data", never a guessed status —
// same null-safe convention the anomaly detectors use.
//
// Every threshold-based category is banded as a severity multiple of the
// SAME line anomaly.ts already flags at: <=0.7x = healthy, <=1.0x =
// watch (approaching the line), <=1.4x = concern (past the line, same
// territory anomaly.ts would flag), >1.4x = critical. This mirrors the
// "how far past the threshold" severity logic computeConfidence already
// uses, just banded into four labels instead of a continuous score.
//
// Profitability and Growth have no existing anomaly.ts threshold to
// borrow (yoy_swing_pct is a symmetric volatility check, not a "growth
// is bad" floor). Growth reuses yoy_swing_pct anyway (downside only,
// same severity bands). Profitability's 2-percentage-point "comfortable
// margin move" reference is a new, unvalidated starting assumption —
// flagged here the same way config.ts flags its own unvalidated
// thresholds, worth calibrating against real filings later rather than
// treated as authoritative.
//
// Efficiency uses inventory_days and Working Capital uses
// receivable_days — kept as two separate categories rather than both
// pulling from the same working-capital-days signal twice under
// different labels. payable_days is computed by engine.ts but has no
// configured threshold anywhere in config.ts, so it's left out of
// status here (informational only wherever it's shown elsewhere) rather
// than graded against a number nobody has reviewed.

import { computeRatios } from "./engine";
import { getSectorConfig } from "./config";
import type { FinancialStatement } from "./types";

export type HealthStatus = "healthy" | "watch" | "concern" | "critical" | "no_data";

export type HealthCategory = {
  key: string;
  label: string;
  status: HealthStatus;
  metric_label: string | null;
  value: number | null;
  detail: string | null;
};

export type HealthScore = {
  overall: HealthStatus;
  categories: HealthCategory[];
};

const STATUS_SCORE: Record<Exclude<HealthStatus, "no_data">, number> = {
  healthy: 4,
  watch: 3,
  concern: 2,
  critical: 1,
};

/** severity: 0 = comfortably fine, 1.0 = exactly at the existing
 * anomaly.ts threshold line, higher = further past it. Same four bands
 * used for every ratio-vs-threshold category below. */
function bandFromSeverity(severity: number): Exclude<HealthStatus, "no_data"> {
  if (severity <= 0.7) return "healthy";
  if (severity <= 1.0) return "watch";
  if (severity <= 1.4) return "concern";
  return "critical";
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export function computeHealthScore(
  stmt: FinancialStatement,
  prior: FinancialStatement | null,
  sector: string
): HealthScore {
  const cfg = getSectorConfig(sector);
  const t = cfg.anomaly_thresholds;
  const ratios = computeRatios(stmt, prior, sector);
  const categories: HealthCategory[] = [];

  // Profitability — PAT margin trend vs. the prior period's own margin.
  // Negative margin is always at least "concern" regardless of trend —
  // a company can be improving and still be loss-making.
  {
    const margin = ratios["pat_margin"];
    const priorMargin =
      prior && prior.revenue_from_operations
        ? prior.profit_after_tax / prior.revenue_from_operations
        : null;
    if (margin == null) {
      categories.push({
        key: "profitability", label: "Profitability", status: "no_data",
        metric_label: null, value: null, detail: null,
      });
    } else if (priorMargin == null) {
      // No prior period to compare — fall back to the sign of the
      // margin itself rather than showing no_data for a company's very
      // first period on file.
      const status = margin < 0 ? "critical" : margin === 0 ? "concern" : "healthy";
      categories.push({
        key: "profitability", label: "Profitability", status,
        metric_label: "PAT margin", value: margin,
        detail: `PAT margin is ${pct(margin)} \u2014 no prior period on file to compare the trend`,
      });
    } else {
      const deltaPP = (margin - priorMargin) * 100; // percentage points
      let status = bandFromSeverity(deltaPP >= 0 ? 0 : Math.abs(deltaPP) / 2);
      if (margin < 0 && status !== "critical") status = "concern";
      const direction = deltaPP >= 0 ? "expanded" : "contracted";
      categories.push({
        key: "profitability", label: "Profitability", status,
        metric_label: "PAT margin", value: margin,
        detail: `PAT margin ${direction} ${Math.abs(deltaPP).toFixed(1)}pp vs. prior period, to ${pct(margin)}`,
      });
    }
  }

  // Liquidity — current ratio vs. current_ratio_min (existing threshold).
  {
    const ratio = ratios["current_ratio"];
    if (ratio == null) {
      categories.push({
        key: "liquidity", label: "Liquidity", status: "no_data",
        metric_label: null, value: null, detail: null,
      });
    } else {
      const severity = t.current_ratio_min / Math.max(ratio, 0.01);
      categories.push({
        key: "liquidity", label: "Liquidity", status: bandFromSeverity(severity),
        metric_label: "Current ratio", value: ratio,
        detail: `Current ratio of ${ratio.toFixed(2)}x vs. the ${t.current_ratio_min.toFixed(2)}x threshold`,
      });
    }
  }

  // Efficiency — inventory days vs. inventory_days_max (existing threshold).
  {
    const invDays = ratios["inventory_days"];
    if (invDays == null) {
      categories.push({
        key: "efficiency", label: "Efficiency", status: "no_data",
        metric_label: null, value: null, detail: null,
      });
    } else {
      const severity = invDays / t.inventory_days_max;
      categories.push({
        key: "efficiency", label: "Efficiency", status: bandFromSeverity(severity),
        metric_label: "Inventory days", value: invDays,
        detail: `${invDays.toFixed(0)} inventory days vs. the ${t.inventory_days_max.toFixed(0)}-day threshold`,
      });
    }
  }

  // Growth — YoY revenue growth, downside-only, reusing yoy_swing_pct
  // (the same threshold detectYoySwings already checks against).
  {
    const growth = ratios["yoy_revenue_growth"];
    if (growth == null) {
      categories.push({
        key: "growth", label: "Growth", status: "no_data",
        metric_label: null, value: null, detail: null,
      });
    } else {
      const threshold = t.yoy_swing_pct / 100;
      const severity = growth >= 0 ? 0 : Math.abs(growth) / threshold;
      const direction = growth >= 0 ? "grew" : "declined";
      categories.push({
        key: "growth", label: "Growth", status: bandFromSeverity(severity),
        metric_label: "Revenue YoY", value: growth,
        detail: `Revenue ${direction} ${pct(Math.abs(growth))} YoY`,
      });
    }
  }

  // Leverage — debt-to-equity vs. debt_equity_max (existing threshold).
  {
    const de = ratios["debt_to_equity"];
    if (de == null) {
      categories.push({
        key: "leverage", label: "Leverage", status: "no_data",
        metric_label: null, value: null, detail: null,
      });
    } else {
      const severity = de / t.debt_equity_max;
      categories.push({
        key: "leverage", label: "Leverage", status: bandFromSeverity(severity),
        metric_label: "Debt-to-equity", value: de,
        detail: `Debt-to-equity of ${de.toFixed(2)}x vs. the ${t.debt_equity_max.toFixed(2)}x threshold`,
      });
    }
  }

  // Cash Flow — no cash-flow fields are extracted anywhere in the schema
  // yet (see types.ts). Permanently no_data until that changes.
  categories.push({
    key: "cash_flow", label: "Cash Flow", status: "no_data",
    metric_label: null, value: null,
    detail: "Cash Flow statement not yet extracted for this company",
  });

  // Working Capital — receivable days vs. receivable_days_max (existing
  // threshold). See file header on why payable_days isn't included.
  {
    const recDays = ratios["receivable_days"];
    if (recDays == null) {
      categories.push({
        key: "working_capital", label: "Working Capital", status: "no_data",
        metric_label: null, value: null, detail: null,
      });
    } else {
      const severity = recDays / t.receivable_days_max;
      categories.push({
        key: "working_capital", label: "Working Capital", status: bandFromSeverity(severity),
        metric_label: "Receivable days", value: recDays,
        detail: `${recDays.toFixed(0)} receivable days vs. the ${t.receivable_days_max.toFixed(0)}-day threshold`,
      });
    }
  }

  // Capital Allocation — needs ROE/ROCE/dividend data this schema
  // doesn't model yet. Permanently no_data until that changes.
  categories.push({
    key: "capital_allocation", label: "Capital Allocation", status: "no_data",
    metric_label: null, value: null,
    detail: "ROE/ROCE/dividend data not yet modeled",
  });

  // Overall — equal-weighted average of every category that has data,
  // rounded back to the nearest band. no_data only if nothing at all is
  // computable (shouldn't happen in practice — Profitability and Growth
  // only need the Income Statement, which every statement has).
  const scored = categories.filter(
    (c): c is HealthCategory & { status: Exclude<HealthStatus, "no_data"> } => c.status !== "no_data"
  );
  let overall: HealthStatus = "no_data";
  if (scored.length > 0) {
    const avg = scored.reduce((sum, c) => sum + STATUS_SCORE[c.status], 0) / scored.length;
    overall = avg >= 3.5 ? "healthy" : avg >= 2.5 ? "watch" : avg >= 1.5 ? "concern" : "critical";
  }

  return { overall, categories };
}
'''

os.makedirs(os.path.dirname(health_path), exist_ok=True)
if os.path.exists(health_path):
    print("!! " + health_path + " already exists \\u2014 not overwriting. Delete it first if you want a clean rebuild.")
    sys.exit(1)
write(health_path, HEALTH_TS)
print("created " + health_path + " (" + str(len(HEALTH_TS.encode("utf-8"))) + " bytes)")
brace_balance(health_path, HEALTH_TS)

# ---------------------------------------------------------------------
# 2. Edit app/sentinel/kpi/page.tsx
# ---------------------------------------------------------------------
page_path = os.path.join(ROOT, "app", "sentinel", "kpi", "page.tsx")
page_src = read(page_path)

edits = []

edits.append((
    '''import { buildPeerTable, buildTimeSeries } from "../lib/engine";
import { getBenchmark, type Benchmark } from "../lib/benchmark";
import { SERIF, T } from "../lib/theme";
import type { FinancialStatement, Workspace } from "../lib/types";''',
    '''import { buildPeerTable, buildTimeSeries, findPriorYear } from "../lib/engine";
import { getBenchmark, type Benchmark } from "../lib/benchmark";
import { computeHealthScore, type HealthCategory, type HealthStatus } from "../lib/health";
import { SERIF, T } from "../lib/theme";
import type { FinancialStatement, Workspace } from "../lib/types";''',
    "page.tsx: add health engine + findPriorYear imports",
))

edits.append((
    '''function ChartCard({''',
    '''const HEALTH_COLORS: Record<HealthStatus, { bg: string; text: string; statusLabel: string }> = {
  healthy: { bg: "#E8F0E3", text: "#2F5233", statusLabel: "Healthy" },
  watch: { bg: "#FBF0DC", text: "#8A6416", statusLabel: "Watch" },
  concern: { bg: "#FBE4D8", text: "#9A4A1F", statusLabel: "Concern" },
  critical: { bg: "#F6DCDC", text: "#8C2A2A", statusLabel: "Critical" },
  no_data: { bg: T.background, text: T.inkSoft, statusLabel: "No data" },
};

function HealthChip({ category }: { category: HealthCategory }) {
  const colors = HEALTH_COLORS[category.status];
  return (
    <div
      style={{ background: colors.bg, borderRadius: 3, padding: "0.7rem 0.8rem" }}
      title={category.detail ?? undefined}
    >
      <p
        style={{
          fontSize: "0.6rem",
          fontWeight: 500,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: colors.text,
          margin: "0 0 0.3rem 0",
        }}
      >
        {category.label}
      </p>
      <p style={{ fontSize: "0.85rem", fontWeight: 600, color: colors.text, margin: 0 }}>
        {colors.statusLabel}
      </p>
    </div>
  );
}

function ChartCard({''',
    "page.tsx: HEALTH_COLORS + HealthChip component",
))

edits.append((
    '''  const revenueTrend = buildTimeSeries(selected, statements, "revenue_from_operations");
  const patTrend = buildTimeSeries(selected, statements, "profit_after_tax");''',
    '''  const ownFYStatements = statements
    .filter((s) => s.workspace_id === selected.id && s.period_type === "FY")
    .sort((a, b) => a.period_end_date.localeCompare(b.period_end_date));
  const latestOwnStatement = ownFYStatements[ownFYStatements.length - 1] ?? null;
  const priorOwnStatement = latestOwnStatement
    ? findPriorYear(latestOwnStatement, statements)
    : null;
  const healthScore = latestOwnStatement
    ? computeHealthScore(latestOwnStatement, priorOwnStatement, selected.sector)
    : null;

  const revenueTrend = buildTimeSeries(selected, statements, "revenue_from_operations");
  const patTrend = buildTimeSeries(selected, statements, "profit_after_tax");''',
    "page.tsx: compute healthScore for the selected company",
))

edits.append((
    '''      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 1,
          background: T.rule,
          border: `1px solid ${T.rule}`,
          marginBottom: "1.75rem",
        }}
      >
        <KpiCard
          label="Revenue (latest FY)"''',
    '''      {healthScore && (
        <div
          style={{
            background: T.card,
            border: `1px solid ${T.rule}`,
            borderRadius: 3,
            padding: "1.4rem 1.6rem",
            marginBottom: "1.75rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.7rem", marginBottom: "1rem" }}>
            <p
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: T.inkSoft,
                margin: 0,
              }}
            >
              Business Health
            </p>
            <span
              style={{
                fontSize: "0.78rem",
                fontWeight: 600,
                color: HEALTH_COLORS[healthScore.overall].text,
                background: HEALTH_COLORS[healthScore.overall].bg,
                borderRadius: 3,
                padding: "0.15rem 0.55rem",
              }}
            >
              Overall: {HEALTH_COLORS[healthScore.overall].statusLabel}
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "0.6rem",
            }}
          >
            {healthScore.categories.map((c) => (
              <HealthChip key={c.key} category={c} />
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 1,
          background: T.rule,
          border: `1px solid ${T.rule}`,
          marginBottom: "1.75rem",
        }}
      >
        <KpiCard
          label="Revenue (latest FY)"''',
    "page.tsx: Business Health card above the KPI grid",
))

current = page_src
all_ok = True
for old, new, label in edits:
    result = unique_replace(current, old, new, label)
    if result is None:
        all_ok = False
        break
    current = result

if all_ok:
    write(page_path, current)
    print("edited " + page_path)
    brace_balance(page_path, current)
else:
    print("!! page.tsx NOT written due to an anchor failure above \\u2014 no partial write performed.")

print("")
print("Done. Now run:  npm run build")
print("Then:            git status  /  git diff --stat")
