"use client";
export const dynamic = "force-dynamic";

// Local demo only. `npm run demo` starts a fake Supabase seeded with fictional companies and sets NEXT_PUBLIC_SENTINEL_DEMO=1; this page then
// plants the fake's session in the browser and opens Sentinel, so no sign-in service is needed. With the variable unset (every real
// deployment) it does nothing but say so, and the token it would plant means nothing to a real database.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const ON = process.env.NEXT_PUBLIC_SENTINEL_DEMO === "1";

export default function DemoSignIn() {
  const router = useRouter();
  useEffect(() => {
    if (!ON) return;
    const now = Math.floor(Date.now() / 1000);
    const session = {
      access_token: "tok-a", token_type: "bearer", expires_in: 31536000, expires_at: now + 31536000, refresh_token: "r-tok-a",
      user: { id: "00000000-0000-4000-8000-00000000000a", aud: "authenticated", role: "authenticated", email: "demo@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
    };
    try { localStorage.setItem("zyntask-engage-session", JSON.stringify(session)); } catch { /* storage blocked: the page below says so */ }
    router.replace("/sentinel/projects");
  }, [router]);
  return <p style={{ fontFamily: "sans-serif", padding: "2rem" }}>{ON ? "Opening the demo..." : "The demo sign-in is off. Start it with npm run demo."}</p>;
}
