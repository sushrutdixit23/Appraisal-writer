import { redirect } from "next/navigation";

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
