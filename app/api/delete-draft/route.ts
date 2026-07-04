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

  const { id, reason } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  if (reason) {
    const { data: draft } = await supabase
      .from("interactions")
      .select("type, reply")
      .eq("id", id)
      .eq("client_id", client.id)
      .single();

    if (draft) {
      await supabase.from("rejection_events").insert({
        client_id: client.id,
        interaction_type: draft.type,
        original_text: draft.reply,
        reason,
      });
    }
  }

  const { error } = await supabase
    .from("interactions")
    .delete()
    .eq("id", id)
    .eq("client_id", client.id);

  if (error) return NextResponse.json({ error: "Failed to delete." }, { status: 500 });

  return NextResponse.json({ deleted: true });
}
