import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const dsnRaw = process.env.UNIPILE_DSN!;
  const dsn = dsnRaw.replace(/^https?:\/\//, "");
  const apiKey = process.env.UNIPILE_API_KEY!;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://zyntask.in";

  const expiresOn = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const res = await fetch(`https://${dsn}/api/v1/hosted/accounts/link`, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
      "accept": "application/json",
    },
    body: JSON.stringify({
      type: "create",
      providers: ["LINKEDIN"],
      api_url: `https://${dsn}`,
      expiresOn,
      name: user.id,
      notify_url: `${baseUrl}/api/linkedin-callback`,
      success_redirect_url: `${baseUrl}/account?linkedin=connected`,
      failure_redirect_url: `${baseUrl}/account?linkedin=failed`,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Unipile hosted auth error:", err);
    return NextResponse.json({ error: "Failed to generate LinkedIn connect link." }, { status: 500 });
  }

  const data = await res.json();
  return NextResponse.json({ url: data.url });
}

