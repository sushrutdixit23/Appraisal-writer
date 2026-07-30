# -*- coding: utf-8 -*-
"""
Replaces the word-frequency 'topWords' chip block in app/voice/page.tsx
with the new Claude-generated insights (summary, tone_patterns, themes),
matching the API shape shipped in voice-stats/route.ts.

Single anchor-verified replacement, not a full-file rewrite - only this
block changes, the rest of the page is untouched.

Run from C:\\Users\\Admin\\appraisal-writer:
    py patch_voice_page.py
"""

PATH = r"app\voice\page.tsx"

OLD = '''            {stats.topWords && stats.topWords.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-ink-soft mb-2">Words that show up often in your sent replies</p>
                <div className="flex flex-wrap gap-2">
                  {stats.topWords.map((w: string) => (
                    <span key={w} className="text-[12px] px-3 py-1 rounded-full bg-mist border border-line text-ink-soft">{w}</span>
                  ))}
                </div>
              </div>
            )}'''

NEW = '''            {stats.insights && (
              <div>
                <p className="text-[12.5px] text-ink leading-relaxed mb-4">{stats.insights.summary}</p>
                {stats.insights.tone_patterns && stats.insights.tone_patterns.length > 0 && (
                  <div className="mb-4">
                    <p className="text-[11px] font-semibold text-ink-soft mb-2">How you tend to edit</p>
                    <ul className="list-disc list-inside space-y-1.5 text-[12px] text-slate">
                      {stats.insights.tone_patterns.map((p: string, idx: number) => (
                        <li key={idx}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {stats.insights.themes && stats.insights.themes.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-ink-soft mb-2">What you write about</p>
                    <div className="flex flex-wrap gap-2">
                      {stats.insights.themes.map((t: string) => (
                        <span key={t} className="text-[12px] px-3 py-1 rounded-full bg-mist border border-line text-ink-soft">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}'''

with open(PATH, "r", encoding="utf-8") as f:
    content = f.read()

count = content.count(OLD)
print(f"Anchor matches found: {count}")

if count != 1:
    print("ABORTING - anchor did not match exactly once. No file was written.")
    print("---first 300 chars of what we searched for---")
    print(OLD[:300])
else:
    new_content = content.replace(OLD, NEW)
    with open(PATH, "w", encoding="utf-8", newline="\n") as f:
        f.write(new_content)

    ob, cb = content.count("{"), content.count("}")
    nb_o, nb_c = new_content.count("{"), new_content.count("}")
    print(f"Old brace balance: {{ = {ob}, }} = {cb}, {'OK' if ob == cb else 'MISMATCH'}")
    print(f"New brace balance: {{ = {nb_o}, }} = {nb_c}, {'OK' if nb_o == nb_c else 'MISMATCH'}")
    print(f"Lines: {content.count(chr(10)) + 1} -> {new_content.count(chr(10)) + 1}")
    print("Now run: git diff app/voice/page.tsx")