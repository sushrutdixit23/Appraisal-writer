# -*- coding: utf-8 -*-
"""
Adds error checking to the voice_insights upsert in
app/api/voice-stats/route.ts. Currently the write's result is never
inspected - if it silently fails, insights still render correctly
for that one request (from the in-memory `generated` object) but
nothing persists, so the next load pays for a Claude call that
should have been served from cache. This makes that failure visible
in logs instead of silent.

Single anchor-verified replacement - only this one call site changes.

Run from C:\\Users\\Admin\\appraisal-writer:
    py patch_voice_upsert_error.py
"""

PATH = r"app\api\voice-stats\route.ts"

OLD = '''        insights = generated;
        await supabase.from("voice_insights").upsert({
          client_id: client.id,
          summary: generated.summary,
          tone_patterns: generated.tone_patterns,
          themes: generated.themes,
          based_on_count: totalSent,
          generated_at: new Date().toISOString(),
        }, { onConflict: "client_id" });'''

NEW = '''        insights = generated;
        const { error: upsertError } = await supabase.from("voice_insights").upsert({
          client_id: client.id,
          summary: generated.summary,
          tone_patterns: generated.tone_patterns,
          themes: generated.themes,
          based_on_count: totalSent,
          generated_at: new Date().toISOString(),
        }, { onConflict: "client_id" });
        if (upsertError) {
          console.error("Voice insights: cache write failed:", upsertError.message);
        }'''

with open(PATH, "r", encoding="utf-8") as f:
    content = f.read()

count = content.count(OLD)
print(f"Anchor matches found: {count}")

if count != 1:
    print("ABORTING - anchor did not match exactly once. No file was written.")
else:
    new_content = content.replace(OLD, NEW)
    with open(PATH, "w", encoding="utf-8", newline="\n") as f:
        f.write(new_content)

    ob, cb = content.count("{"), content.count("}")
    nb_o, nb_c = new_content.count("{"), new_content.count("}")
    print(f"Old brace balance: {{ = {ob}, }} = {cb}, {'OK' if ob == cb else 'MISMATCH'}")
    print(f"New brace balance: {{ = {nb_o}, }} = {nb_c}, {'OK' if nb_o == nb_c else 'MISMATCH'}")
    print("Now run: git diff app/api/voice-stats/route.ts")