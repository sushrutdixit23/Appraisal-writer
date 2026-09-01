# -*- coding: utf-8 -*-
"""
Sentinel - KPI Dashboard Phase A: Peer Ranking view. Surfaces Rank,
Percentile, Industry Average, Industry Leader, Closest Peer, and Gap -
all already computed by getBenchmark()/getMetricValue(), just never
displayed anywhere until now. Adds a metric-selectable ranking panel
below the existing peer bar charts.
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

edit1_old = """import { getBenchmark, type Benchmark } from "../lib/benchmark";
import { computeHealthScore, type HealthCategory, type HealthStatus } from "../lib/health";
import { SERIF, T } from "../lib/theme";
import type { FinancialStatement, Workspace } from "../lib/types";"""
edit1_new = """import { getBenchmark, getMetricValue, type Benchmark } from "../lib/benchmark";
import { computeHealthScore, type HealthCategory, type HealthStatus } from "../lib/health";
import { SERIF, T } from "../lib/theme";
import type { FinancialStatement, PeerRow, Workspace } from "../lib/types";"""
current2 = apply_edit(current, edit1_old, edit1_new, "add getMetricValue + PeerRow imports", get_content_cmd)

edit2_old = """function formatIndustryLine(b: Benchmark | null, isRatio: boolean): string | null {
  if (!b || b.industryAverage == null || !b.industryLeader) return null;
  const fmt = (v: number) =>
    isRatio ? `${(v * 100).toFixed(1)}%` : v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return `Industry avg ${fmt(b.industryAverage)} \\u00b7 Leader ${b.industryLeader.company_name} (${fmt(
    b.industryLeader.value
  )})`;
}

export default function KpiDashboardPage() {"""
edit2_new = """function formatIndustryLine(b: Benchmark | null, isRatio: boolean): string | null {
  if (!b || b.industryAverage == null || !b.industryLeader) return null;
  const fmt = (v: number) =>
    isRatio ? `${(v * 100).toFixed(1)}%` : v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return `Industry avg ${fmt(b.industryAverage)} \\u00b7 Leader ${b.industryLeader.company_name} (${fmt(
    b.industryLeader.value
  )})`;
}

const PEER_RANKING_METRICS: {
  label: string;
  metric: string;
  direction: "higher_is_better" | "lower_is_better";
  unit: "pp" | "cr" | "x" | "d";
}[] = [
  { label: "Revenue", metric: "revenue_cr", direction: "higher_is_better", unit: "cr" },
  { label: "EBITDA Margin", metric: "ebitda_margin", direction: "higher_is_better", unit: "pp" },
  { label: "PAT Margin", metric: "pat_margin", direction: "higher_is_better", unit: "pp" },
  { label: "Revenue YoY", metric: "yoy_revenue_growth", direction: "higher_is_better", unit: "pp" },
  { label: "PAT YoY", metric: "yoy_pat_growth", direction: "higher_is_better", unit: "pp" },
  { label: "Current Ratio", metric: "current_ratio", direction: "higher_is_better", unit: "x" },
  { label: "Debt-to-Equity", metric: "debt_to_equity", direction: "lower_is_better", unit: "x" },
  { label: "Inventory Days", metric: "inventory_days", direction: "lower_is_better", unit: "d" },
  { label: "Receivable Days", metric: "receivable_days", direction: "lower_is_better", unit: "d" },
  { label: "Cash Conversion Cycle", metric: "cash_conversion_cycle", direction: "lower_is_better", unit: "d" },
];

function formatByUnit(v: number, unit: "pp" | "cr" | "x" | "d"): string {
  if (unit === "pp") return `${(v * 100).toFixed(1)}%`;
  if (unit === "x") return `${v.toFixed(2)}x`;
  if (unit === "d") return `${v.toFixed(0)}d`;
  return v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

// Computed directly from peerRows (not approximated from percentile) so
// the displayed rank is always an exact "N of M" against the real
// values on file, using the same null-safe metric extraction
// getBenchmark itself uses via getMetricValue.
function computeRank(
  rows: PeerRow[],
  subjectId: string,
  metric: string,
  direction: "higher_is_better" | "lower_is_better"
): { rank: number; total: number } | null {
  const values = rows
    .map((r) => ({ id: r.workspace_id, value: getMetricValue(r, metric) }))
    .filter((x): x is { id: string; value: number } => x.value != null);
  const subject = values.find((x) => x.id === subjectId);
  if (!subject) return null;
  const better = values.filter((x) =>
    direction === "higher_is_better" ? x.value > subject.value : x.value < subject.value
  ).length;
  return { rank: better + 1, total: values.length };
}

function RankStat({ label, value }: { label: string; value: string }) {
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
current3 = None
if current2 is not None:
    current3 = apply_edit(current2, edit2_old, edit2_new, "add PEER_RANKING_METRICS, computeRank, RankStat", get_content_cmd)

edit3_old = """  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingPptx, setDownloadingPptx] = useState(false);"""
edit3_new = """  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingPptx, setDownloadingPptx] = useState(false);
  const [rankingMetric, setRankingMetric] = useState(PEER_RANKING_METRICS[0].metric);"""
current4 = None
if current3 is not None:
    current4 = apply_edit(current3, edit3_old, edit3_new, "add rankingMetric state", get_content_cmd)

edit4_old = """  const sectorPeers = workspaces.filter((w) => w.sector === selected.sector);
  const peerRows = buildPeerTable(sectorPeers, statements, selected.id, "FY");
  const selfRow = peerRows.find((r) => r.is_subject) ?? null;

  const revenueData = peerRows.map((r) => ({ label: r.company_name, value: r.revenue_cr }));"""
edit4_new = """  const sectorPeers = workspaces.filter((w) => w.sector === selected.sector);
  const peerRows = buildPeerTable(sectorPeers, statements, selected.id, "FY");
  const selfRow = peerRows.find((r) => r.is_subject) ?? null;

  const rankingDef =
    PEER_RANKING_METRICS.find((m) => m.metric === rankingMetric) ?? PEER_RANKING_METRICS[0];
  const rankingBenchmark = getBenchmark(peerRows, selected.id, rankingDef.metric, rankingDef.direction);
  const rank = computeRank(peerRows, selected.id, rankingDef.metric, rankingDef.direction);

  const revenueData = peerRows.map((r) => ({ label: r.company_name, value: r.revenue_cr }));"""
current5 = None
if current4 is not None:
    current5 = apply_edit(current4, edit4_old, edit4_new, "compute rankingDef/rankingBenchmark/rank", get_content_cmd)

edit5_old = """      <ChartCard title="PAT margin vs. peers" subtitle={formatIndustryLine(patBenchmark, true)}>
        <HorizontalBarChart data={patMarginData} isRatio={true} highlightLabel={selected.company_name} />
      </ChartCard>
    </div>
  );
}"""
edit5_new = """      <ChartCard title="PAT margin vs. peers" subtitle={formatIndustryLine(patBenchmark, true)}>
        <HorizontalBarChart data={patMarginData} isRatio={true} highlightLabel={selected.company_name} />
      </ChartCard>

      <div
        style={{
          background: T.card,
          border: `1px solid ${T.rule}`,
          borderRadius: 3,
          padding: "1.4rem 1.6rem",
          marginBottom: "1.4rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.2rem",
          }}
        >
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
            Peer Ranking
          </p>
          <select
            value={rankingMetric}
            onChange={(e) => setRankingMetric(e.target.value)}
            style={{
              fontFamily: "inherit",
              fontSize: "0.85rem",
              padding: "0.4rem 0.6rem",
              border: `1px solid ${T.rule}`,
              borderRadius: 3,
              background: T.card,
              color: T.ink,
            }}
          >
            {PEER_RANKING_METRICS.map((m) => (
              <option key={m.metric} value={m.metric}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "1rem",
          }}
        >
          <RankStat label="Rank" value={rank ? `${rank.rank} of ${rank.total}` : "\\u2014"} />
          <RankStat
            label="Percentile"
            value={
              rankingBenchmark.percentile != null ? `${Math.round(rankingBenchmark.percentile)}th` : "\\u2014"
            }
          />
          <RankStat
            label="Industry Average"
            value={
              rankingBenchmark.industryAverage != null
                ? formatByUnit(rankingBenchmark.industryAverage, rankingDef.unit)
                : "\\u2014"
            }
          />
          <RankStat
            label="Industry Leader"
            value={
              rankingBenchmark.industryLeader
                ? `${rankingBenchmark.industryLeader.company_name} (${formatByUnit(
                    rankingBenchmark.industryLeader.value,
                    rankingDef.unit
                  )})`
                : "\\u2014"
            }
          />
          <RankStat
            label="Closest Peer"
            value={rankingBenchmark.closestPeer ? rankingBenchmark.closestPeer.company_name : "\\u2014"}
          />
          <RankStat
            label="Gap to Closest Peer"
            value={formatBenchmarkNote(rankingBenchmark, rankingDef.unit) ?? "\\u2014"}
          />
        </div>
      </div>
    </div>
  );
}"""
current6 = None
if current5 is not None:
    current6 = apply_edit(current5, edit5_old, edit5_new, "render Peer Ranking panel", get_content_cmd)

if current6 is not None:
    write(page_path, current6)
    print("[OK] wrote " + page_path)
    brace_check(page_path, current6)
else:
    print("[MISS] page.tsx NOT written - at least one edit failed above. No partial write performed.")

print("")
print("Then:  npm run build")
print("Then:  git status  /  git diff --stat")
