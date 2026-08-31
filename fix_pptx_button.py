# -*- coding: utf-8 -*-
"""
Sentinel - corrected version: adds Export PPTX button next to Export
PDF on the KPI Dashboard. Only touches page.tsx (the state and handler
edits from the last attempt already matched correctly and are repeated
here unchanged; only the button-block anchor is fixed).
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

page_path = os.path.join(ROOT, "app", "sentinel", "kpi", "page.tsx")
current = read(page_path)
get_content_cmd = page_path

edit1_old = '  const [downloadingPdf, setDownloadingPdf] = useState(false);'
edit1_new = '''  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingPptx, setDownloadingPptx] = useState(false);'''
current2 = apply_edit(current, edit1_old, edit1_new, "add downloadingPptx state", get_content_cmd)

edit2_old = '''  const sectorPeers = workspaces.filter((w) => w.sector === selected.sector);
  const peerRows = buildPeerTable(sectorPeers, statements, selected.id, "FY");
  const selfRow = peerRows.find((r) => r.is_subject) ?? null;'''
edit2_new = '''  async function exportPptx() {
    setDownloadingPptx(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/api/sentinel/export/pptx", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspace_id: selected.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selected.company_name.replace(/\\s+/g, "_")}_Board_Deck.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "PPTX export failed");
    } finally {
      setDownloadingPptx(false);
    }
  }

  const sectorPeers = workspaces.filter((w) => w.sector === selected.sector);
  const peerRows = buildPeerTable(sectorPeers, statements, selected.id, "FY");
  const selfRow = peerRows.find((r) => r.is_subject) ?? null;'''
current3 = None
if current2 is not None:
    current3 = apply_edit(current2, edit2_old, edit2_new, "add exportPptx handler", get_content_cmd)

edit3_old = '''        <button
          onClick={exportPdf}
          disabled={downloadingPdf}
          style={{
            fontFamily: "inherit",
            fontSize: "0.85rem",
            fontWeight: 500,
            padding: "0.5rem 1.1rem",
            border: `1px solid ${T.ink}`,
            borderRadius: 3,
            background: "transparent",
            color: T.ink,
            cursor: downloadingPdf ? "default" : "pointer",
            opacity: downloadingPdf ? 0.6 : 1,
          }}
        >
          {downloadingPdf ? "Generating PDF\\u2026" : "Export PDF"}
        </button>
      </div>'''
edit3_new = '''        <div style={{ display: "flex", gap: "0.6rem" }}>
          <button
            onClick={exportPdf}
            disabled={downloadingPdf}
            style={{
              fontFamily: "inherit",
              fontSize: "0.85rem",
              fontWeight: 500,
              padding: "0.5rem 1.1rem",
              border: `1px solid ${T.ink}`,
              borderRadius: 3,
              background: "transparent",
              color: T.ink,
              cursor: downloadingPdf ? "default" : "pointer",
              opacity: downloadingPdf ? 0.6 : 1,
            }}
          >
            {downloadingPdf ? "Generating PDF\\u2026" : "Export PDF"}
          </button>
          <button
            onClick={exportPptx}
            disabled={downloadingPptx}
            style={{
              fontFamily: "inherit",
              fontSize: "0.85rem",
              fontWeight: 500,
              padding: "0.5rem 1.1rem",
              border: `1px solid ${T.ink}`,
              borderRadius: 3,
              background: "transparent",
              color: T.ink,
              cursor: downloadingPptx ? "default" : "pointer",
              opacity: downloadingPptx ? 0.6 : 1,
            }}
          >
            {downloadingPptx ? "Generating PPTX\\u2026" : "Export PPTX"}
          </button>
        </div>
      </div>'''
current4 = None
if current3 is not None:
    current4 = apply_edit(current3, edit3_old, edit3_new, "add Export PPTX button", get_content_cmd)

if current4 is not None:
    write(page_path, current4)
    print("[OK] wrote " + page_path)
    brace_check(page_path, current4)
else:
    print("[MISS] page.tsx NOT written - at least one edit failed above. No partial write performed.")

print("")
print("If you have not already, run:  npm install pptxgenjs")
print("Then:  npm run build")
print("Then:  git status  /  git diff --stat")
