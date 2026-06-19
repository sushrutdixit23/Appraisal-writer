import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

export async function POST(req: NextRequest) {
  const { id, client_id, text } = await req.json();

  if (!id || !client_id || !text) {
    return NextResponse.json({ error: "Missing id, client_id, or text" }, { status: 400 });
  }

  // Fetch the interaction row to get type, chat_id, and the client's Unipile credentials
  const { data: interaction, error: fetchError } = await supabase
    .from("interactions")
    .select("*")
    .eq("id", id)
    .eq("client_id", client_id)
    .single();

  if (fetchError || !interaction) {
    return NextResponse.json({ error: "Interaction not found" }, { status: 404 });
  }

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("unipile_account_id, daily_cap")
    .eq("id", client_id)
    .single();

  if (clientError || !client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Check the daily cap before sending
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("send_log")
    .select("id", { count: "exact" })
    .eq("client_id", client_id)
    .gte("sent_at", todayStart.toISOString());

  if ((count ?? 0) >= client.daily_cap) {
    return NextResponse.json({ error: "Daily cap reached" }, { status: 429 });
  }

  // Send via Unipile
  const unipileUrl =
    interaction.type === "dm"
      ? `${process.env.UNIPILE_DSN}/api/v1/chats/${interaction.chat_id}/messages`
      : `${process.env.UNIPILE_DSN}/api/v1/posts/${interaction.chat_id}/comments`;

  const formData = new URLSearchParams();
  formData.append("text", text);
  formData.append("account_id", client.unipile_account_id);

  const unipileRes = await fetch(unipileUrl, {
    method: "POST",
    headers: {
      "X-API-KEY": process.env.UNIPILE_API_KEY!,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData,
  });

  if (!unipileRes.ok) {
    const errText = await unipileRes.text();
    return NextResponse.json({ error: `Unipile error: ${errText}` }, { status: 502 });
  }

  // Mark as sent, log the send
  await supabase.from("interactions").update({ status: "sent" }).eq("id", id).eq("client_id", client_id);
  await supabase.from("send_log").insert({ client_id });

  return NextResponse.json({ status: "sent" });
}
