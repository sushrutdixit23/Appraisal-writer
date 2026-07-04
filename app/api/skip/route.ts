import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const { id, client_id, reason } = await req.json();

  if (!id || !client_id) {
    return NextResponse.json({ error: "Missing id or client_id" }, { status: 400 });
  }

  const { data: item } = await supabase
    .from("interactions")
    .select("type, text")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("interactions")
    .update({ status: "skipped" })
    .eq("id", id)
    .eq("client_id", client_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (reason && item) {
    await supabase.from("rejection_events").insert({
      client_id,
      interaction_type: item.type,
      original_text: item.text,
      reason,
    });
  }

  return NextResponse.json({ status: "skipped" });
}
