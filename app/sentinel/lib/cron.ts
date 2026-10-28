// Sentinel - scheduled jobs. Vercel Cron calls these routes with `Authorization: Bearer <CRON_SECRET>`; with no
// CRON_SECRET configured they refuse everything, so a missing setting closes the route instead of opening it.

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { Digest } from "./digest";

export function cronAuthorised(req: Request, secret = process.env.CRON_SECRET): boolean {
  if (!secret) return false;
  const given = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  const a = Buffer.from(given), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const cronRefusal = () => NextResponse.json({ error: "Not authorised." }, { status: 401 });

/** A digest as a short plain-text message: a headline, then each non-empty section with its top items. */
export function digestMessage(company: string, digest: Digest, appUrl: string | null, perSection = 3): string {
  const head = digest.total === 0 ? `Sentinel digest for ${company}: nothing needs attention today.` : `Sentinel digest for ${company}: ${digest.total} item${digest.total > 1 ? "s" : ""} need attention.`;
  const parts = digest.sections
    .filter((s) => s.items.length > 0)
    .map((s) => {
      const lines = s.items.slice(0, perSection).map((i) => `  - ${i.title}`);
      const more = s.items.length > perSection ? `\n  ...and ${s.items.length - perSection} more` : "";
      return `${s.title} (${s.items.length})\n${lines.join("\n")}${more}`;
    });
  return [head, ...parts, appUrl ? `Open: ${appUrl.replace(/\/+$/, "")}/sentinel/digest` : null].filter(Boolean).join("\n\n");
}
