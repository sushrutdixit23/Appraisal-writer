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

  const { id, text } = await req.json();
  if (!id || !text?.trim()) return NextResponse.json({ error: "Missing id or text." }, { status: 400 });

  // Get client
  const { data: client } = await supabase
    .from("clients")
    .select("id, unipile_account_id")
    .eq("auth_user_id", user.id)
    .single();

  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  if (!client.unipile_account_id) return NextResponse.json({ error: "LinkedIn not connected." }, { status: 400 });

  // Publish to LinkedIn via Unipile
  const form = new FormData();
  form.append("account_id", client.unipile_account_id);
  form.append("text", text.trim());

  const unipileRes = await fetch(
    `${process.env.UNIPILE_DSN}/api/v1/posts`,
    {
      method: "POST",
      headers: { "X-API-KEY": process.env.UNIPILE_API_KEY!, "accept": "application/json" },
      body: form,
    }
  );

  const unipileData = await unipileRes.json();

  if (!unipileRes.ok) {
    return NextResponse.json({ error: unipileData.detail || "Failed to publish post." }, { status: 500 });
  }

  // Mark interaction as sent
  await supabase
    .from("interactions")
    .update({ status: "sent", reply: text.trim() })
    .eq("id", id)
    .eq("client_id", client.id);

  return NextResponse.json({ post_id: unipileData.post_id });
}
