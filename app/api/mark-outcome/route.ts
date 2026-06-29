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
  const { id, outcome, outcome_value } = await req.json();
  if (!id || !outcome) return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  const { data: client } = await supabase.from("clients").select("id").eq("auth_user_id", user.id).single();
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  const { error } = await supabase.from("interactions")
    .update({ outcome, outcome_value, outcome_marked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("client_id", client.id);
  if (error) return NextResponse.json({ error: "Failed to mark outcome." }, { status: 500 });
  return NextResponse.json({ marked: true });
}
