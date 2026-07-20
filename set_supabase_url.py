path = ".env.local"
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
found = False
for line in lines:
    if line.startswith("NEXT_PUBLIC_SUPABASE_URL="):
        new_lines.append("NEXT_PUBLIC_SUPABASE_URL=\"https://jkxwshciyubjwstogruu.supabase.co\"\n")
        found = True
    else:
        new_lines.append(line)

if not found:
    raise SystemExit("NEXT_PUBLIC_SUPABASE_URL line not found in .env.local - file structure may differ from expected")

with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.writelines(new_lines)

print("NEXT_PUBLIC_SUPABASE_URL set directly.")
