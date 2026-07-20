def replace_once(text, old, new, label, path):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"FAILED anchor '{label}' in {path}: found {count} matches, expected 1")
    return text.replace(old, new, 1)

# --- ats-check: inject real current date ---
path1 = "app/api/ats-check/route.ts"
with open(path1, "r", encoding="utf-8") as f:
    c1 = f.read()

old1 = "const userMessage = `RESUME:\\n${resumeText}\\n\\n${roleContext}`;"
new1 = '''const today = new Date().toISOString().slice(0, 10);
    const userMessage = `TODAY'S ACTUAL DATE: ${today} (use this as ground truth for judging whether any employment or education date is genuinely future-dated - do not assume any other date)\\n\\nRESUME:\\n${resumeText}\\n\\n${roleContext}`;'''
c1 = replace_once(c1, old1, new1, "ats-check date injection", path1)

with open(path1, "w", encoding="utf-8", newline="\n") as f:
    f.write(c1)
print(f"Fixed {path1}")

# --- resume-build: inject real current date, and stop guessing at date "fixes" ---
path2 = "app/api/resume-build/route.ts"
with open(path2, "r", encoding="utf-8") as f:
    c2 = f.read()

old2 = "const userMessage = `ORIGINAL RESUME:\\n${resumeText}\\n\\n${roleContext}`;"
new2 = '''const today = new Date().toISOString().slice(0, 10);
    const userMessage = `TODAY'S ACTUAL DATE: ${today} (use this as ground truth - do not "correct" any date that is already valid relative to today, and do not assume any other date is current)\\n\\nORIGINAL RESUME:\\n${resumeText}\\n\\n${roleContext}`;'''
c2 = replace_once(c2, old2, new2, "resume-build date injection", path2)

old2b = "- Fix any future-dated or ambiguous employment dates only if the fix is obvious from context (e.g. an evident typo); otherwise flag it in CHANGES rather than silently guessing"
new2b = "- Only flag a date as an issue if it is genuinely after today's actual date (provided to you below) or is internally inconsistent within the resume itself. Never \"correct\" a date that is already valid - if uncertain, leave it unchanged and do not mention it in CHANGES"
c2 = replace_once(c2, old2b, new2b, "resume-build date-fix rule", path2)

with open(path2, "w", encoding="utf-8", newline="\n") as f:
    f.write(c2)
print(f"Fixed {path2}")
