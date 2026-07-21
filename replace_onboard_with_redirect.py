# -*- coding: utf-8 -*-
"""
Retires the crashing 9-screen /onboard wizard, replacing it with a redirect
to /setup (the current interactive onboarding). Preserves any query string,
notably ?expired=1 used by the trial-expiry redirect in dashboard/page.tsx.

The old wizard's full history remains in git - this is a full-file
replacement, not an edit, because the page's entire purpose is changing.

Run from C:\\Users\\Admin\\appraisal-writer:
    py replace_onboard_with_redirect.py
"""

PATH = r"app\onboard\page.tsx"

NEW_CONTENT = '''import { redirect } from "next/navigation";

// The 9-screen onboarding wizard that used to live here has been replaced
// by /setup. This page exists only to catch old links, bookmarks, and
// in-app references to /onboard (account page, SiteNav, dashboard's
// trial-expiry redirect, Engage marketing CTAs) and forward them to
// /setup - including any query string - so nothing that used to work
// silently breaks.
export default async function OnboardRedirect({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams(
    Object.entries(params).flatMap(([key, value]) => {
      if (value === undefined) return [];
      const values = Array.isArray(value) ? value : [value];
      return values.map((v) => [key, v] as [string, string]);
    })
  ).toString();
  redirect(qs ? `/setup?${qs}` : "/setup");
}
'''

with open(PATH, "r", encoding="utf-8") as f:
    old_content = f.read()

with open(PATH, "w", encoding="utf-8", newline="\n") as f:
    f.write(NEW_CONTENT)

with open(PATH, "r", encoding="utf-8") as f:
    new_content = f.read()

print(f"Old file: {len(old_content)} bytes -> New file: {len(new_content)} bytes")
print(f"Contains redirect(: {'redirect(' in new_content}")
print(f"Contains /setup: {'/setup' in new_content}")
print(f"Preserves searchParams: {'searchParams' in new_content}")
print("Old 9-screen wizard retired. Full history preserved in git via 'git log -- app/onboard/page.tsx'.")
