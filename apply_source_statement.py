# -*- coding: utf-8 -*-
"""
Sentinel - Tier 1: Source-Statement viewer. Metadata-only (source_file,
source_page, extraction_notes already exist on FinancialStatement but
were never shown anywhere) - a native title-attribute tooltip on each
period's column header, same convention as HealthChip and the Formula
Viewer, not a new UI pattern or an actual document viewer (Sentinel
does not store the original uploaded files anywhere).
Only touches app/sentinel/statements/page.tsx. Run from the repo root.
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

page_path = os.path.join(ROOT, "app", "sentinel", "statements", "page.tsx")
current = read(page_path)
get_content_cmd = page_path

edit1_old = """function formatVsPeer(b: Benchmark | null | undefined, isRatio: boolean): string {
  if (!b || !b.closestPeer || b.gapToClosestPeer == null) return "\u2014";
  const sign = b.gapToClosestPeer >= 0 ? "+" : "";
  const gap = isRatio
    ? `${sign}${(b.gapToClosestPeer * 100).toFixed(1)}pp`
    : `${sign}${b.gapToClosestPeer.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  return `${gap} vs ${b.closestPeer.company_name}`;
}"""
edit1_new = """function formatVsPeer(b: Benchmark | null | undefined, isRatio: boolean): string {
  if (!b || !b.closestPeer || b.gapToClosestPeer == null) return "\u2014";
  const sign = b.gapToClosestPeer >= 0 ? "+" : "";
  const gap = isRatio
    ? `${sign}${(b.gapToClosestPeer * 100).toFixed(1)}pp`
    : `${sign}${b.gapToClosestPeer.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  return `${gap} vs ${b.closestPeer.company_name}`;
}

// Source-Statement viewer: source_file/source_page/extraction_notes
// already exist on every FinancialStatement row but were never shown
// anywhere. Metadata only, via a native title tooltip (same convention
// as HealthChip and the KPI Dashboard Formula Viewer) - not an actual
// document viewer, since Sentinel does not store the originally
// uploaded files anywhere.
function sourceTooltip(p: FinancialStatement): string {
  let text = `Source: ${p.source_file}`;
  if (p.source_page) text += `, page ${p.source_page}`;
  if (p.extraction_notes) text += ` - ${p.extraction_notes}`;
  return text;
}"""
current2 = apply_edit(current, edit1_old, edit1_new, "add sourceTooltip function", get_content_cmd)

edit2_old = """                {periods.map((p) => (
                  <th
                    key={p.id}
                    style={{ ...cellStyle, fontFamily: SERIF, fontWeight: 600, fontSize: "0.95rem", color: T.ink }}
                  >
                    {p.period_label}
                    <div style={{ fontSize: "0.65rem", fontWeight: 400, color: T.inkSoft, textTransform: "uppercase" }}>
                      {p.basis}
                    </div>
                  </th>
                ))}"""
edit2_new = """                {periods.map((p) => (
                  <th
                    key={p.id}
                    title={sourceTooltip(p)}
                    style={{ ...cellStyle, fontFamily: SERIF, fontWeight: 600, fontSize: "0.95rem", color: T.ink }}
                  >
                    {p.period_label}
                    <div style={{ fontSize: "0.65rem", fontWeight: 400, color: T.inkSoft, textTransform: "uppercase" }}>
                      {p.basis}
                    </div>
                  </th>
                ))}"""
current3 = None
if current2 is not None:
    current3 = apply_edit(current2, edit2_old, edit2_new, "add title tooltip to period header", get_content_cmd)

if current3 is not None:
    write(page_path, current3)
    print("[OK] wrote " + page_path)
    brace_check(page_path, current3)
else:
    print("[MISS] page.tsx NOT written - at least one edit failed above. No partial write performed.")

print("")
print("Then:  npm run build")
print("Then:  git status  /  git diff --stat")
