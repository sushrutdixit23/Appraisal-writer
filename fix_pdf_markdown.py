# -*- coding: utf-8 -*-
"""
Sentinel - fix raw markdown bleeding into the PDF's Key Investigations
section (same bug class as the PPTX fix, same plain-string-method
solution - no regex, no backslash escaping anywhere). Touches:
  app/sentinel/lib/pdf/mis-pack.tsx  (add verdict field + render it)
  app/api/sentinel/export/pdf/route.ts  (extract verdict from narrative)
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

mispack_path = os.path.join(ROOT, "app", "sentinel", "lib", "pdf", "mis-pack.tsx")
mispack_current = read(mispack_path)
mispack_get_content = mispack_path

mp_edit1_old = """export type MisPackInvestigation = {
  periodLabel: string;
  status: string;
  confidenceScore: number | null;
  namedPeer: string | null;
  narrative: string;
};"""
mp_edit1_new = """export type MisPackInvestigation = {
  periodLabel: string;
  status: string;
  confidenceScore: number | null;
  namedPeer: string | null;
  verdict: string | null;
  narrative: string;
};"""
mispack2 = apply_edit(mispack_current, mp_edit1_old, mp_edit1_new, "mis-pack.tsx: add verdict to type", mispack_get_content)

mp_edit2_old = """  investigationHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  investigationPeriod: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  investigationStatus: { fontSize: 7.5, color: INK_SOFT, textTransform: "uppercase" },
  investigationNarrative: { fontSize: 8.5, lineHeight: 1.5, marginBottom: 4 },"""
mp_edit2_new = """  investigationHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  investigationPeriod: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  investigationStatus: { fontSize: 7.5, color: INK_SOFT, textTransform: "uppercase" },
  investigationVerdict: { fontSize: 9, fontFamily: "Helvetica-Bold", color: ACCENT, marginBottom: 4 },
  investigationNarrative: { fontSize: 8.5, lineHeight: 1.5, marginBottom: 4 },"""
mispack3 = None
if mispack2 is not None:
    mispack3 = apply_edit(mispack2, mp_edit2_old, mp_edit2_new, "mis-pack.tsx: add investigationVerdict style", mispack_get_content)

mp_edit3_old = """          <Text style={styles.investigationNarrative}>{inv.narrative}</Text>"""
mp_edit3_new = """          {inv.verdict && <Text style={styles.investigationVerdict}>{inv.verdict}</Text>}
          <Text style={styles.investigationNarrative}>{inv.narrative}</Text>"""
mispack4 = None
if mispack3 is not None:
    mispack4 = apply_edit(mispack3, mp_edit3_old, mp_edit3_new, "mis-pack.tsx: render verdict above narrative", mispack_get_content)

if mispack4 is not None:
    write(mispack_path, mispack4)
    print("[OK] wrote " + mispack_path)
    brace_check(mispack_path, mispack4)
else:
    print("[MISS] mis-pack.tsx NOT written - at least one edit failed above. No partial write performed.")

route_path = os.path.join(ROOT, "app", "api", "sentinel", "export", "pdf", "route.ts")
route_current = read(route_path)
route_get_content = route_path

r_edit1_old = """function gapNote(
  b: ReturnType<typeof getBenchmark>,
  unit: "pp" | "cr" | "x" | "d"
): string | null {
  if (!b.closestPeer || b.gapToClosestPeer == null) return null;
  const sign = b.gapToClosestPeer >= 0 ? "+" : "";
  const magnitude =
    unit === "pp"
      ? `${(b.gapToClosestPeer * 100).toFixed(1)}pp`
      : unit === "x"
      ? `${b.gapToClosestPeer.toFixed(2)}x`
      : unit === "d"
      ? `${b.gapToClosestPeer.toFixed(0)}d`
      : `${b.gapToClosestPeer.toLocaleString("en-IN", { maximumFractionDigits: 0 })} cr`;
  return `vs ${b.closestPeer.company_name}: ${sign}${magnitude}`;
}"""
r_edit1_new = """function gapNote(
  b: ReturnType<typeof getBenchmark>,
  unit: "pp" | "cr" | "x" | "d"
): string | null {
  if (!b.closestPeer || b.gapToClosestPeer == null) return null;
  const sign = b.gapToClosestPeer >= 0 ? "+" : "";
  const magnitude =
    unit === "pp"
      ? `${(b.gapToClosestPeer * 100).toFixed(1)}pp`
      : unit === "x"
      ? `${b.gapToClosestPeer.toFixed(2)}x`
      : unit === "d"
      ? `${b.gapToClosestPeer.toFixed(0)}d`
      : `${b.gapToClosestPeer.toLocaleString("en-IN", { maximumFractionDigits: 0 })} cr`;
  return `vs ${b.closestPeer.company_name}: ${sign}${magnitude}`;
}

// The narrative generation prompt (see narrative/route.ts) always
// starts turn 2's reply with exactly one short bolded markdown verdict
// line, then a blank line, then the full analyst narrative - same
// structure Investigation Queue's parseVerdict already splits apart,
// and the same plain-string implementation used in the PPTX export
// route (no regex, no backslash-escaping surface for this to break on).
function extractVerdict(narrative: string): { verdict: string | null; body: string } {
  if (!narrative.startsWith("**")) {
    return { verdict: null, body: narrative };
  }
  const closeIdx = narrative.indexOf("**", 2);
  if (closeIdx === -1) {
    return { verdict: null, body: narrative };
  }
  const verdict = narrative.slice(2, closeIdx);
  const body = narrative.slice(closeIdx + 2).trim();
  return { verdict, body };
}"""
route2 = apply_edit(route_current, r_edit1_old, r_edit1_new, "route.ts: add extractVerdict helper", route_get_content)

r_edit2_old = """    .map((inv) => ({
      periodLabel: inv.period_label,
      status: inv.status,
      confidenceScore: inv.confidence_score,
      namedPeer: inv.named_peer,
      narrative:
        (inv.status === "approved" || inv.status === "edited"
          ? inv.final_narrative
          : inv.ai_narrative) ?? "No narrative on file.",
    }));"""
r_edit2_new = """    .map((inv) => {
      const rawNarrative =
        (inv.status === "approved" || inv.status === "edited"
          ? inv.final_narrative
          : inv.ai_narrative) ?? "No narrative on file.";
      const { verdict, body } = extractVerdict(rawNarrative);
      return {
        periodLabel: inv.period_label,
        status: inv.status,
        confidenceScore: inv.confidence_score,
        namedPeer: inv.named_peer,
        verdict,
        narrative: body,
      };
    });"""
route3 = None
if route2 is not None:
    route3 = apply_edit(route2, r_edit2_old, r_edit2_new, "route.ts: extract verdict for each investigation", route_get_content)

if route3 is not None:
    write(route_path, route3)
    print("[OK] wrote " + route_path)
    brace_check(route_path, route3)
else:
    print("[MISS] route.ts NOT written - at least one edit failed above. No partial write performed.")

print("")
print("Then:  npm run build")
print("Then:  git status  /  git diff --stat")
