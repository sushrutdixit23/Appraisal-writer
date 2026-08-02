# -*- coding: utf-8 -*-
"""
Sentinel — Benchmark Engine build script.
Creates app/sentinel/lib/benchmark.ts, wires it into
app/api/sentinel/narrative/route.ts and app/sentinel/kpi/page.tsx.
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
# 1. Create app/sentinel/lib/benchmark.ts
# ---------------------------------------------------------------------
benchmark_path = os.path.join(ROOT, "app", "sentinel", "lib", "benchmark.ts")

benchmark_ts = '''// Sentinel — Benchmark Engine. Formalizes "named peer + industry
// context" as a reusable, metric-agnostic piece so any page that shows
// a company's number next to its peers (KPI Dashboard, Financial
// Statements, Deep Analysis, investigation narratives) draws from the
// same logic instead of each place recomputing its own closest-peer or
// average by hand.
//
// findClosestPeer below is the exact same logic that used to live
// inline in the narrative API route — moved, not changed, so
// investigation generation's peer selection doesn't shift.

import type { PeerRow } from "./types";

export type BenchmarkDirection = "higher_is_better" | "lower_is_better";

export type Benchmark = {
  metric: string;
  direction: BenchmarkDirection;
  subjectValue: number | null;
  closestPeer: { company_name: string; value: number | null } | null;
  industryAverage: number | null;
  industryLeader: { company_name: string; value: number } | null;
  /** 0-100, direction-aware: share of the peer set (excluding the
   * subject itself) the subject is at or ahead of. Null if fewer than
   * two peers have a value for this metric. */
  percentile: number | null;
  /** subjectValue - closestPeer.value, raw units (not direction-flipped). */
  gapToClosestPeer: number | null;
  gapToLeader: number | null;
  /** Peers (including the subject) with a non-null value for this metric. */
  sampleSize: number;
};

/** Extract one metric's value off a PeerRow. The three raw absolute
 * fields (revenue_cr, pat_cr, pbt_cr) live as top-level PeerRow
 * properties; every other metric (margins, YoY, liquidity/leverage
 * ratios) lives in the row's `ratios` map under the same id used
 * throughout engine.ts / config.ts. */
export function getMetricValue(row: PeerRow, metric: string): number | null {
  if (metric === "revenue_cr") return row.revenue_cr;
  if (metric === "pat_cr") return row.pat_cr;
  if (metric === "pbt_cr") return row.pbt_cr;
  return row.ratios[metric] ?? null;
}

/** The single peer most comparable to the subject by revenue scale -
 * closest absolute revenue, excluding the subject itself. Real advisory
 * work (GDT, TSR benchmarking decks) names one specific peer rather than
 * only citing a sector average - "you vs your closest comp" is a
 * sharper, more defensible comparison than "you vs the mean of five
 * companies at very different scales". Returns null if there's no other
 * peer in the row set. */
export function findClosestPeer(rows: PeerRow[], subjectWorkspaceId: string): PeerRow | null {
  const subject = rows.find((r) => r.workspace_id === subjectWorkspaceId);
  if (!subject) return null;
  const others = rows.filter((r) => r.workspace_id !== subjectWorkspaceId);
  if (others.length === 0) return null;
  others.sort(
    (a, b) =>
      Math.abs(a.revenue_cr - subject.revenue_cr) - Math.abs(b.revenue_cr - subject.revenue_cr)
  );
  return others[0];
}

/** Full benchmark context for one metric: the named closest peer, the
 * industry average and leader across the whole row set, and the
 * subject's percentile rank. `direction` controls what "leader" and
 * "percentile" mean for this metric - most margins/growth ratios are
 * higher_is_better; days-outstanding and leverage ratios
 * (inventory_days, receivable_days, payable_days, debt_to_equity) are
 * lower_is_better. Callers pass the right direction per metric rather
 * than the engine guessing from the metric name string. */
export function getBenchmark(
  rows: PeerRow[],
  subjectWorkspaceId: string,
  metric: string,
  direction: BenchmarkDirection = "higher_is_better"
): Benchmark {
  const subjectRow = rows.find((r) => r.workspace_id === subjectWorkspaceId) ?? null;
  const subjectValue = subjectRow ? getMetricValue(subjectRow, metric) : null;

  const valued = rows
    .map((r) => ({ row: r, value: getMetricValue(r, metric) }))
    .filter((x): x is { row: PeerRow; value: number } => x.value != null);

  const closestPeerRow = findClosestPeer(rows, subjectWorkspaceId);
  const closestPeer = closestPeerRow
    ? { company_name: closestPeerRow.company_name, value: getMetricValue(closestPeerRow, metric) }
    : null;

  const industryAverage =
    valued.length > 0 ? valued.reduce((sum, x) => sum + x.value, 0) / valued.length : null;

  let industryLeader: Benchmark["industryLeader"] = null;
  if (valued.length > 0) {
    const best = valued.reduce((a, b) => {
      const aBetter = direction === "higher_is_better" ? a.value >= b.value : a.value <= b.value;
      return aBetter ? a : b;
    });
    industryLeader = { company_name: best.row.company_name, value: best.value };
  }

  let percentile: number | null = null;
  if (subjectValue != null && valued.length > 1) {
    const peers = valued.filter((x) => x.row.workspace_id !== subjectWorkspaceId);
    const atOrBehindCount = peers.filter((x) =>
      direction === "higher_is_better" ? subjectValue >= x.value : subjectValue <= x.value
    ).length;
    percentile = (atOrBehindCount / peers.length) * 100;
  }

  const gapToClosestPeer =
    subjectValue != null && closestPeer?.value != null ? subjectValue - closestPeer.value : null;
  const gapToLeader =
    subjectValue != null && industryLeader != null ? subjectValue - industryLeader.value : null;

  return {
    metric,
    direction,
    subjectValue,
    closestPeer,
    industryAverage,
    industryLeader,
    percentile,
    gapToClosestPeer,
    gapToLeader,
    sampleSize: valued.length,
  };
}
'''

os.makedirs(os.path.dirname(benchmark_path), exist_ok=True)
if os.path.exists(benchmark_path):
    print("!! " + benchmark_path + " already exists — not overwriting. Delete it first if you want a clean rebuild.")
    sys.exit(1)
write(benchmark_path, benchmark_ts)
print("created " + benchmark_path + " (" + str(len(benchmark_ts.encode("utf-8"))) + " bytes)")
brace_balance(benchmark_path, benchmark_ts)

# ---------------------------------------------------------------------
# 2. Edit app/api/sentinel/narrative/route.ts
# ---------------------------------------------------------------------
route_path = os.path.join(ROOT, "app", "api", "sentinel", "narrative", "route.ts")
route_src = read(route_path)

old_imports = '''import { getSectorConfig } from "../../../sentinel/lib/config";'''
new_imports = '''import { getSectorConfig } from "../../../sentinel/lib/config";
import { findClosestPeer } from "../../../sentinel/lib/benchmark";'''
route_src2 = unique_replace(route_src, old_imports, new_imports, "route.ts: add benchmark import")

old_fn = '''/** The single peer most comparable to the subject by revenue scale -
 * closest absolute revenue, excluding the subject itself. Real advisory
 * work (GDT, TSR benchmarking decks) names one specific peer rather than
 * only citing a sector average - "you vs your closest comp" is a sharper,
 * more defensible comparison than "you vs the mean of five companies at
 * very different scales". Returns null if there's no other peer to name. */
function findClosestPeer(rows: PeerRow[], subjectWorkspaceId: string): PeerRow | null {
  const subject = rows.find((r) => r.workspace_id === subjectWorkspaceId);
  if (!subject) return null;
  const others = rows.filter((r) => r.workspace_id !== subjectWorkspaceId);
  if (others.length === 0) return null;
  others.sort(
    (a, b) =>
      Math.abs(a.revenue_cr - subject.revenue_cr) - Math.abs(b.revenue_cr - subject.revenue_cr)
  );
  return others[0];
}

'''
route_src3 = None
if route_src2 is not None:
    route_src3 = unique_replace(route_src2, old_fn, "", "route.ts: remove local findClosestPeer")

if route_src2 is not None and route_src3 is not None:
    write(route_path, route_src3)
    print("edited " + route_path)
    brace_balance(route_path, route_src3)
else:
    print("!! route.ts NOT written due to anchor failure above — check the file manually.")

# ---------------------------------------------------------------------
# 3. Edit app/sentinel/kpi/page.tsx
# ---------------------------------------------------------------------
page_path = os.path.join(ROOT, "app", "sentinel", "kpi", "page.tsx")
page_src = read(page_path)

edits = []

edits.append((
    '''import { buildPeerTable, buildTimeSeries } from "../lib/engine";''',
    '''import { buildPeerTable, buildTimeSeries } from "../lib/engine";
import { getBenchmark, type Benchmark } from "../lib/benchmark";''',
    "page.tsx: add benchmark import",
))

edits.append((
    '''function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: T.card, padding: "1rem 1.1rem" }}>
      <p
        style={{
          fontSize: "0.62rem",
          fontWeight: 500,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: T.inkSoft,
          margin: "0 0 0.35rem 0",
        }}
      >
        {label}
      </p>
      <p style={{ fontFamily: SERIF, fontSize: "1.6rem", fontWeight: 500, color: T.ink, margin: 0 }}>
        {value}
      </p>
    </div>
  );
}''',
    '''function KpiCard({ label, value, note }: { label: string; value: string; note?: string | null }) {
  return (
    <div style={{ background: T.card, padding: "1rem 1.1rem" }}>
      <p
        style={{
          fontSize: "0.62rem",
          fontWeight: 500,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: T.inkSoft,
          margin: "0 0 0.35rem 0",
        }}
      >
        {label}
      </p>
      <p style={{ fontFamily: SERIF, fontSize: "1.6rem", fontWeight: 500, color: T.ink, margin: 0 }}>
        {value}
      </p>
      {note && (
        <p style={{ fontSize: "0.68rem", color: T.inkSoft, margin: "0.35rem 0 0 0" }}>{note}</p>
      )}
    </div>
  );
}''',
    "page.tsx: KpiCard note prop",
))

edits.append((
    '''function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
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
          margin: "0 0 1rem 0",
        }}
      >
        {title}
      </p>
      {children}
    </div>
  );
}''',
    '''function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string | null;
  children: React.ReactNode;
}) {
  return (
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
          margin: subtitle ? "0 0 0.3rem 0" : "0 0 1rem 0",
        }}
      >
        {title}
      </p>
      {subtitle && (
        <p style={{ fontSize: "0.72rem", color: T.inkSoft, margin: "0 0 1rem 0" }}>{subtitle}</p>
      )}
      {children}
    </div>
  );
}''',
    "page.tsx: ChartCard subtitle prop",
))

edits.append((
    '''const pct = (v: number | null) => (v == null ? "\\u2014" : `${(v * 100).toFixed(1)}%`);
const num = (v: number | null) =>
  v == null ? "\\u2014" : v.toLocaleString("en-IN", { maximumFractionDigits: 0 });''',
    '''const pct = (v: number | null) => (v == null ? "\\u2014" : `${(v * 100).toFixed(1)}%`);
const num = (v: number | null) =>
  v == null ? "\\u2014" : v.toLocaleString("en-IN", { maximumFractionDigits: 0 });

function formatBenchmarkNote(b: Benchmark | null, isRatio: boolean): string | null {
  if (!b || !b.closestPeer || b.gapToClosestPeer == null) return null;
  const sign = b.gapToClosestPeer >= 0 ? "+" : "";
  const gap = isRatio
    ? `${sign}${(b.gapToClosestPeer * 100).toFixed(1)}pp`
    : `${sign}${b.gapToClosestPeer.toLocaleString("en-IN", { maximumFractionDigits: 0 })} cr`;
  return `vs ${b.closestPeer.company_name}: ${gap}`;
}

function formatIndustryLine(b: Benchmark | null, isRatio: boolean): string | null {
  if (!b || b.industryAverage == null || !b.industryLeader) return null;
  const fmt = (v: number) =>
    isRatio ? `${(v * 100).toFixed(1)}%` : v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return `Industry avg ${fmt(b.industryAverage)} \\u00b7 Leader ${b.industryLeader.company_name} (${fmt(
    b.industryLeader.value
  )})`;
}''',
    "page.tsx: formatBenchmarkNote / formatIndustryLine helpers",
))

edits.append((
    '''  const revenueTrend = buildTimeSeries(selected, statements, "revenue_from_operations");
  const patTrend = buildTimeSeries(selected, statements, "profit_after_tax");''',
    '''  const revenueBenchmark = getBenchmark(peerRows, selected.id, "revenue_cr");
  const ebitdaBenchmark = getBenchmark(peerRows, selected.id, "ebitda_margin");
  const patBenchmark = getBenchmark(peerRows, selected.id, "pat_margin");
  const yoyBenchmark = getBenchmark(peerRows, selected.id, "yoy_revenue_growth");

  const revenueTrend = buildTimeSeries(selected, statements, "revenue_from_operations");
  const patTrend = buildTimeSeries(selected, statements, "profit_after_tax");''',
    "page.tsx: compute 4 benchmarks",
))

edits.append((
    '''        <KpiCard label="Revenue (latest FY)" value={selfRow ? num(selfRow.revenue_cr) : "\\u2014"} />
        <KpiCard label="EBITDA margin" value={pct(selfRow?.ratios.ebitda_margin ?? null)} />
        <KpiCard label="PAT margin" value={pct(selfRow?.ratios.pat_margin ?? null)} />
        <KpiCard label="Revenue YoY" value={pct(selfRow?.ratios.yoy_revenue_growth ?? null)} />''',
    '''        <KpiCard
          label="Revenue (latest FY)"
          value={selfRow ? num(selfRow.revenue_cr) : "\\u2014"}
          note={formatBenchmarkNote(revenueBenchmark, false)}
        />
        <KpiCard
          label="EBITDA margin"
          value={pct(selfRow?.ratios.ebitda_margin ?? null)}
          note={formatBenchmarkNote(ebitdaBenchmark, true)}
        />
        <KpiCard
          label="PAT margin"
          value={pct(selfRow?.ratios.pat_margin ?? null)}
          note={formatBenchmarkNote(patBenchmark, true)}
        />
        <KpiCard
          label="Revenue YoY"
          value={pct(selfRow?.ratios.yoy_revenue_growth ?? null)}
          note={formatBenchmarkNote(yoyBenchmark, true)}
        />''',
    "page.tsx: wire notes into 4 KpiCards",
))

edits.append((
    '''      <ChartCard title="Revenue vs. peers (latest FY)">
        <HorizontalBarChart data={revenueData} isRatio={false} highlightLabel={selected.company_name} />
      </ChartCard>

      <ChartCard title="EBITDA margin vs. peers">
        <HorizontalBarChart data={ebitdaMarginData} isRatio={true} highlightLabel={selected.company_name} />
      </ChartCard>

      <ChartCard title="PAT margin vs. peers">
        <HorizontalBarChart data={patMarginData} isRatio={true} highlightLabel={selected.company_name} />
      </ChartCard>''',
    '''      <ChartCard title="Revenue vs. peers (latest FY)" subtitle={formatIndustryLine(revenueBenchmark, false)}>
        <HorizontalBarChart data={revenueData} isRatio={false} highlightLabel={selected.company_name} />
      </ChartCard>

      <ChartCard title="EBITDA margin vs. peers" subtitle={formatIndustryLine(ebitdaBenchmark, true)}>
        <HorizontalBarChart data={ebitdaMarginData} isRatio={true} highlightLabel={selected.company_name} />
      </ChartCard>

      <ChartCard title="PAT margin vs. peers" subtitle={formatIndustryLine(patBenchmark, true)}>
        <HorizontalBarChart data={patMarginData} isRatio={true} highlightLabel={selected.company_name} />
      </ChartCard>''',
    "page.tsx: subtitle on 3 peer ChartCards",
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
    print("!! page.tsx NOT written due to an anchor failure above — no partial write performed.")

print("")
print("Done. Now run:  npm run build")
print("Then:            git status  /  git diff --stat")
