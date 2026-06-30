import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const origin = req.headers.get("origin") || "https://www.zyntask.in";

  const expiresOn = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const unipileRes = await fetch(`${process.env.UNIPILE_DSN}/api/v1/hosted/accounts/link`, {
    method: "POST",
    headers: {
      "X-API-KEY": process.env.UNIPILE_API_KEY!,
      "accept": "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      type: "create",
      providers: ["LINKEDIN"],
      api_url: process.env.UNIPILE_DSN,
      expiresOn,
      success_redirect_url: `${origin}/connect-linkedin/success`,
      failure_redirect_url: `${origin}/connect-linkedin/failed`,
      notify_url: `${origin}/api/unipile-webhook`,
      name: user.id,
    }),
  });

  const data = await unipileRes.json();

  if (!unipileRes.ok) {
    return NextResponse.json({ error: data.detail || "Failed to create connection link." }, { status: 500 });
  }

  return NextResponse.json({ url: data.url });
}
