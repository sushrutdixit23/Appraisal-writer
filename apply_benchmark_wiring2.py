# -*- coding: utf-8 -*-
"""
Sentinel — wire Benchmark Engine into Financial Statements and Deep
Analysis. Run from the repo root (the folder containing package.json).
Assumes benchmark.ts already exists at app/sentinel/lib/benchmark.ts
(built in the previous pass).
"""
import io
import os

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

def apply_edits(path, edits):
    src = read(path)
    current = src
    for old, new, label in edits:
        count = current.count(old)
        if count != 1:
            print("!! ANCHOR FAILED (" + label + "): found " + str(count) + " occurrences, expected 1. " + path + " NOT written.")
            return False
        current = current.replace(old, new, 1)
    write(path, current)
    print("edited " + path)
    brace_balance(path, current)
    return True

# ---------------------------------------------------------------------
# Financial Statements
# ---------------------------------------------------------------------
fs_path = os.path.join(ROOT, "app", "sentinel", "statements", "page.tsx")

fs_edits = []

fs_edits.append((
    '''import { SERIF, T } from "../lib/theme";
import type { FinancialStatement, Workspace } from "../lib/types";''',
    '''import { buildPeerTable } from "../lib/engine";
import { getBenchmark, type Benchmark } from "../lib/benchmark";
import { SERIF, T } from "../lib/theme";
import type { FinancialStatement, Workspace } from "../lib/types";''',
    "statements: add benchmark/engine imports",
))

fs_edits.append((
    '''function yoyPct(current: number | null, prior: number | null): string {
  if (current == null || prior == null || prior === 0) return "\\u2014";
  const pct = ((current - prior) / Math.abs(prior)) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}''',
    '''function yoyPct(current: number | null, prior: number | null): string {
  if (current == null || prior == null || prior === 0) return "\\u2014";
  const pct = ((current - prior) / Math.abs(prior)) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function formatVsPeer(b: Benchmark | null | undefined, isRatio: boolean): string {
  if (!b || !b.closestPeer || b.gapToClosestPeer == null) return "\\u2014";
  const sign = b.gapToClosestPeer >= 0 ? "+" : "";
  const gap = isRatio
    ? `${sign}${(b.gapToClosestPeer * 100).toFixed(1)}pp`
    : `${sign}${b.gapToClosestPeer.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  return `${gap} vs ${b.closestPeer.company_name}`;
}''',
    "statements: add formatVsPeer helper",
))

fs_edits.append((
    '''  const ebitdaMargins = periods.map((p) =>
    p.ebitda != null && p.revenue_from_operations !== 0 ? p.ebitda / p.revenue_from_operations : null
  );
  const patMargins = periods.map((p) =>
    p.revenue_from_operations !== 0 ? p.profit_after_tax / p.revenue_from_operations : null
  );''',
    '''  const ebitdaMargins = periods.map((p) =>
    p.ebitda != null && p.revenue_from_operations !== 0 ? p.ebitda / p.revenue_from_operations : null
  );
  const patMargins = periods.map((p) =>
    p.revenue_from_operations !== 0 ? p.profit_after_tax / p.revenue_from_operations : null
  );

  // Benchmark Engine wiring: peer context is inherently latest-period,
  // same scoping YoY% already uses (last two periods only, regardless
  // of how many years the table shows) - "vs Peers" sits alongside
  // YoY% as a single extra column rather than one per period.
  const sectorWorkspaces = workspaces.filter((w) => w.sector === workspace.sector);
  const peerRows = buildPeerTable(sectorWorkspaces, statements, subjectId, "FY");
  const showPeerCol = !commonSize && peerRows.length > 1;
  const rowBenchmarks: Partial<Record<keyof FinancialStatement, Benchmark>> = {
    revenue_from_operations: getBenchmark(peerRows, subjectId, "revenue_cr"),
    profit_before_tax: getBenchmark(peerRows, subjectId, "pbt_cr"),
    profit_after_tax: getBenchmark(peerRows, subjectId, "pat_cr"),
  };
  const ebitdaMarginBenchmark = getBenchmark(peerRows, subjectId, "ebitda_margin");
  const patMarginBenchmark = getBenchmark(peerRows, subjectId, "pat_margin");''',
    "statements: compute peerRows + benchmarks",
))

fs_edits.append((
    '''                {periods.length >= 2 && !commonSize && (
                  <th style={{ ...cellStyle, fontWeight: 600, color: T.accent, fontSize: "0.75rem", textTransform: "uppercase" }}>
                    YoY %
                  </th>
                )}
              </tr>
            </thead>''',
    '''                {periods.length >= 2 && !commonSize && (
                  <th style={{ ...cellStyle, fontWeight: 600, color: T.accent, fontSize: "0.75rem", textTransform: "uppercase" }}>
                    YoY %
                  </th>
                )}
                {showPeerCol && (
                  <th style={{ ...cellStyle, fontWeight: 600, color: T.accent, fontSize: "0.75rem", textTransform: "uppercase" }}>
                    vs Peers
                  </th>
                )}
              </tr>
            </thead>''',
    "statements: vs Peers header cell",
))

fs_edits.append((
    '''                  {periods.length >= 2 && !commonSize && (
                    <td style={{ ...cellStyle, color: T.inkSoft }}>
                      {yoyPct(
                        periods[periods.length - 1][row.key] as number | null,
                        periods[periods.length - 2][row.key] as number | null
                      )}
                    </td>
                  )}
                </tr>
              ))}''',
    '''                  {periods.length >= 2 && !commonSize && (
                    <td style={{ ...cellStyle, color: T.inkSoft }}>
                      {yoyPct(
                        periods[periods.length - 1][row.key] as number | null,
                        periods[periods.length - 2][row.key] as number | null
                      )}
                    </td>
                  )}
                  {showPeerCol && (
                    <td style={{ ...cellStyle, color: T.inkSoft, fontSize: "0.78rem" }}>
                      {formatVsPeer(rowBenchmarks[row.key], false)}
                    </td>
                  )}
                </tr>
              ))}''',
    "statements: vs Peers body cell per row",
))

fs_edits.append((
    '''                {periods.map((p, i) => (
                  <td key={p.id} style={{ ...cellStyle, color: T.inkSoft, fontStyle: "italic" }}>
                    {ebitdaMargins[i] != null ? `${(ebitdaMargins[i]! * 100).toFixed(1)}%` : "\\u2014"}
                  </td>
                ))}
                {periods.length >= 2 && !commonSize && <td style={{ ...cellStyle, color: T.inkSoft }}></td>}
              </tr>
              <tr>
                <td style={{ ...labelCellStyle, fontWeight: 400, color: T.inkSoft, fontStyle: "italic" }}>
                  PAT Margin
                </td>
                {periods.map((p, i) => (
                  <td key={p.id} style={{ ...cellStyle, color: T.inkSoft, fontStyle: "italic" }}>
                    {patMargins[i] != null ? `${(patMargins[i]! * 100).toFixed(1)}%` : "\\u2014"}
                  </td>
                ))}
                {periods.length >= 2 && !commonSize && <td style={{ ...cellStyle, color: T.inkSoft }}></td>}
              </tr>''',
    '''                {periods.map((p, i) => (
                  <td key={p.id} style={{ ...cellStyle, color: T.inkSoft, fontStyle: "italic" }}>
                    {ebitdaMargins[i] != null ? `${(ebitdaMargins[i]! * 100).toFixed(1)}%` : "\\u2014"}
                  </td>
                ))}
                {periods.length >= 2 && !commonSize && <td style={{ ...cellStyle, color: T.inkSoft }}></td>}
                {showPeerCol && (
                  <td style={{ ...cellStyle, color: T.inkSoft, fontStyle: "italic", fontSize: "0.78rem" }}>
                    {formatVsPeer(ebitdaMarginBenchmark, true)}
                  </td>
                )}
              </tr>
              <tr>
                <td style={{ ...labelCellStyle, fontWeight: 400, color: T.inkSoft, fontStyle: "italic" }}>
                  PAT Margin
                </td>
                {periods.map((p, i) => (
                  <td key={p.id} style={{ ...cellStyle, color: T.inkSoft, fontStyle: "italic" }}>
                    {patMargins[i] != null ? `${(patMargins[i]! * 100).toFixed(1)}%` : "\\u2014"}
                  </td>
                ))}
                {periods.length >= 2 && !commonSize && <td style={{ ...cellStyle, color: T.inkSoft }}></td>}
                {showPeerCol && (
                  <td style={{ ...cellStyle, color: T.inkSoft, fontStyle: "italic", fontSize: "0.78rem" }}>
                    {formatVsPeer(patMarginBenchmark, true)}
                  </td>
                )}
              </tr>''',
    "statements: vs Peers cell on margin footer rows",
))

apply_edits(fs_path, fs_edits)

# ---------------------------------------------------------------------
# Deep Analysis
# ---------------------------------------------------------------------
da_path = os.path.join(ROOT, "app", "sentinel", "analysis", "page.tsx")

da_edits = []

da_edits.append((
    '''import { HorizontalBarChart, TrendLineChart } from "../lib/charts";
import { buildPeerTable } from "../lib/engine";
import { SERIF, T } from "../lib/theme";''',
    '''import { HorizontalBarChart, TrendLineChart } from "../lib/charts";
import { buildPeerTable } from "../lib/engine";
import { getBenchmark, type Benchmark } from "../lib/benchmark";
import { SERIF, T } from "../lib/theme";''',
    "analysis: add benchmark import",
))

da_edits.append((
    '''function peerValue(row: PeerRow, key: string): number | null {
  if (key === "revenue_cr" || key === "pat_cr") return row[key as "revenue_cr" | "pat_cr"];
  return row.ratios[key] ?? null;
}''',
    '''function peerValue(row: PeerRow, key: string): number | null {
  if (key === "revenue_cr" || key === "pat_cr") return row[key as "revenue_cr" | "pat_cr"];
  return row.ratios[key] ?? null;
}

function formatBenchmarkNote(b: Benchmark | null, isRatio: boolean): string | null {
  if (!b || !b.closestPeer || b.gapToClosestPeer == null) return null;
  const sign = b.gapToClosestPeer >= 0 ? "+" : "";
  const gap = isRatio
    ? `${sign}${(b.gapToClosestPeer * 100).toFixed(1)}pp`
    : `${sign}${b.gapToClosestPeer.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
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
    "analysis: add formatBenchmarkNote / formatIndustryLine helpers",
))

da_edits.append((
    '''  const peerRows = buildPeerTable(sectorWorkspaces, statements, subjectId, "FY");
  const peerMetric = PEER_METRICS.find((m) => m.key === peerMetricKey)!;
  const barData = peerRows''',
    '''  const peerRows = buildPeerTable(sectorWorkspaces, statements, subjectId, "FY");
  const peerMetric = PEER_METRICS.find((m) => m.key === peerMetricKey)!;
  const peerBenchmark = getBenchmark(peerRows, subjectId, peerMetricKey);
  const barData = peerRows''',
    "analysis: compute peerBenchmark",
))

da_edits.append((
    '''        <select
          value={peerMetricKey}
          onChange={(e) => setPeerMetricKey(e.target.value)}
          style={{ ...selectStyle, marginBottom: "1.2rem" }}
        >
          {PEER_METRICS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        <HorizontalBarChart data={barData} isRatio={peerMetric.isRatio} highlightLabel={subjectWorkspace.company_name} />
        {peerRows.some((r) => r.basis_caveat) && (''',
    '''        <select
          value={peerMetricKey}
          onChange={(e) => setPeerMetricKey(e.target.value)}
          style={{ ...selectStyle, marginBottom: "1.2rem" }}
        >
          {PEER_METRICS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        {(formatBenchmarkNote(peerBenchmark, peerMetric.isRatio) ||
          formatIndustryLine(peerBenchmark, peerMetric.isRatio)) && (
          <p style={{ fontSize: "0.78rem", color: T.inkSoft, margin: "-0.6rem 0 1rem 0" }}>
            {[
              formatBenchmarkNote(peerBenchmark, peerMetric.isRatio),
              formatIndustryLine(peerBenchmark, peerMetric.isRatio),
            ]
              .filter(Boolean)
              .join(" \\u00b7 ")}
          </p>
        )}
        <HorizontalBarChart data={barData} isRatio={peerMetric.isRatio} highlightLabel={subjectWorkspace.company_name} />
        {peerRows.some((r) => r.basis_caveat) && (''',
    "analysis: benchmark caption above bar chart",
))

apply_edits(da_path, da_edits)

print("")
print("Done. Now run:  npm run build")
print("Then:            git status  /  git diff --stat")
