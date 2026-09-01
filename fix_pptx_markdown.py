# -*- coding: utf-8 -*-
"""
Sentinel - fix raw markdown bleeding into the PPTX Key Findings slide.
Extracts the bolded verdict line (same structure Investigation Queue's
parseVerdict already handles) as the clean headline, instead of blindly
truncating across "**verdict**\n\nbody". Uses plain string methods
(startsWith/indexOf/slice/trim), not a regex - no backslash escaping
anywhere in the generated TypeScript, after a regex-escaping mistake
broke the previous version of this same fix.
Only touches app/api/sentinel/export/pptx/route.ts.
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

page_path = os.path.join(ROOT, "app", "api", "sentinel", "export", "pptx", "route.ts")
current = read(page_path)
get_content_cmd = page_path

edit1_old = """function firstSentence(text: string, maxLen: number): string {
  const period = text.indexOf(". ");
  if (period !== -1 && period < maxLen) {
    return text.slice(0, period + 1);
  }
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trim() + "...";
}"""

edit1_new = """// Takes up to maxLen chars, cutting at the first ". " if one falls
// within that window, else hard-truncating with a trailing ellipsis -
// used as a fallback for narratives with no bolded verdict line (see
// extractVerdict below) - the normal case now goes through the verdict
// instead, which is already short by the generation prompt's own design.
function firstSentence(text: string, maxLen: number): string {
  const period = text.indexOf(". ");
  if (period !== -1 && period < maxLen) {
    return text.slice(0, period + 1);
  }
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trim() + "...";
}

// The narrative generation prompt (see narrative/route.ts) always
// starts turn 2's reply with exactly one short bolded markdown verdict
// line, then a blank line, then the full analyst narrative - same
// structure Investigation Queue's parseVerdict already splits apart.
// Reimplemented here (not imported - that is a page-local helper) so
// the deck's headline is the clean verdict text, never the raw
// "**verdict**" markup or a blind mid-sentence truncation spanning
// both the verdict and the body. Plain string methods only, no regex,
// so there is no backslash-escaping surface for this to break on.
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

current2 = apply_edit(current, edit1_old, edit1_new, "add extractVerdict helper", get_content_cmd)

edit2_old = """    .map((inv) => {
      const narrative =
        (inv.status === "approved" || inv.status === "edited"
          ? inv.final_narrative
          : inv.ai_narrative) ?? "No narrative on file.";
      return {
        periodLabel: inv.period_label,
        status: inv.status,
        headline: firstSentence(narrative, 160),
        confidenceScore: inv.confidence_score,
      };
    });"""
edit2_new = """    .map((inv) => {
      const narrative =
        (inv.status === "approved" || inv.status === "edited"
          ? inv.final_narrative
          : inv.ai_narrative) ?? "No narrative on file.";
      const { verdict, body } = extractVerdict(narrative);
      return {
        periodLabel: inv.period_label,
        status: inv.status,
        headline: verdict ?? firstSentence(body, 160),
        confidenceScore: inv.confidence_score,
      };
    });"""
current3 = None
if current2 is not None:
    current3 = apply_edit(current2, edit2_old, edit2_new, "use verdict as clean headline", get_content_cmd)

if current3 is not None:
    write(page_path, current3)
    print("[OK] wrote " + page_path)
    brace_check(page_path, current3)
else:
    print("[MISS] route.ts NOT written - at least one edit failed above. No partial write performed.")

print("")
print("Then:  npm run build")
print("Then:  git status  /  git diff --stat")
