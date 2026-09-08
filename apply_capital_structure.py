# -*- coding: utf-8 -*-
"""
Sentinel - KPI Dashboard Phase C: Capital Structure card. Shows Total
Debt, Total Equity, Debt-to-Equity, and Debt-to-Capital, plus a simple
two-segment bar for the debt/equity mix - pulled directly from
latestOwnStatement's already-known Balance Sheet fields. Always renders
the card frame; shows a plain "no data yet" message when Balance Sheet
fields are not filled in, same discipline as Health Engine's no_data
categories.
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

edit1_old = """  if (sentences.length === 0) return null;
  return sentences.join(". ") + ".";
}

export default function KpiDashboardPage() {"""
edit1_new = """  if (sentences.length === 0) return null;
  return sentences.join(". ") + ".";
}

function CapitalStructureCard({ stmt }: { stmt: FinancialStatement | null }) {
  const debt = stmt?.total_debt ?? null;
  const equity = stmt?.total_equity ?? null;
  const total = debt != null && equity != null ? debt + equity : null;
  const hasData = debt != null && equity != null && total != null && total > 0;
  const debtPct = hasData ? ((debt as number) / (total as number)) * 100 : 0;
  const equityPct = hasData ? 100 - debtPct : 0;

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
        Capital Structure
      </p>
      {hasData ? (
        <>
          <div
            style={{
              display: "flex",
              height: "1.4rem",
              borderRadius: 3,
              overflow: "hidden",
              marginBottom: "0.5rem",
            }}
          >
            <div style={{ width: `${debtPct}%`, background: T.accent }} />
            <div style={{ width: `${equityPct}%`, background: T.rule }} />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.68rem",
              color: T.inkSoft,
              marginBottom: "1rem",
            }}
          >
            <span>Debt {debtPct.toFixed(0)}%</span>
            <span>Equity {equityPct.toFixed(0)}%</span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "1rem",
            }}
          >
            <RankStat label="Total Debt" value={num(debt)} />
            <RankStat label="Total Equity" value={num(equity)} />
            <RankStat
              label="Debt-to-Equity"
              value={ratioX(equity !== 0 ? (debt as number) / (equity as number) : null)}
            />
            <RankStat label="Debt-to-Capital" value={pct((debt as number) / (total as number))} />
          </div>
        </>
      ) : (
        <p style={{ fontSize: "0.85rem", color: T.inkSoft, margin: 0 }}>
          No Balance Sheet data on file yet for this company.
        </p>
      )}
    </div>
  );
}

export default function KpiDashboardPage() {"""
current2 = apply_edit(current, edit1_old, edit1_new, "add CapitalStructureCard component", get_content_cmd)

edit2_old = """          <p style={{ fontSize: "0.92rem", lineHeight: 1.6, color: T.ink, margin: 0 }}>
            {quickSummary}
          </p>
        </div>
      )}
    </div>
  );
}"""
edit2_new = """          <p style={{ fontSize: "0.92rem", lineHeight: 1.6, color: T.ink, margin: 0 }}>
            {quickSummary}
          </p>
        </div>
      )}

      <CapitalStructureCard stmt={latestOwnStatement} />
    </div>
  );
}"""
current3 = None
if current2 is not None:
    current3 = apply_edit(current2, edit2_old, edit2_new, "render CapitalStructureCard", get_content_cmd)

if current3 is not None:
    write(page_path, current3)
    print("[OK] wrote " + page_path)
    brace_check(page_path, current3)
else:
    print("[MISS] page.tsx NOT written - at least one edit failed above. No partial write performed.")

print("")
print("Then:  npm run build")
print("Then:  git status  /  git diff --stat")
