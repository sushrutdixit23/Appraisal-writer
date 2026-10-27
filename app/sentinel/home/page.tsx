"use client";
export const dynamic = "force-dynamic";

// Sentinel - Home. Projects replaced it: the same "what needs attention across every company" view, laid out as
// one card per project. This page stays so existing links keep working.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { T } from "../lib/theme";

export default function HomeRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/sentinel/projects");
  }, [router]);
  return <p style={{ color: T.inkSoft }}>Taking you to your projects...</p>;
}
