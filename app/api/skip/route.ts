import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(req: NextRequest) {
  const { id, client_id } = await req.json();

  if (!id || !client_id) {
    return NextResponse.json({ error: "Missing id or client_id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("interactions")
    .update({ status: "skipped" })
    .eq("id", id)
    .eq("client_id", client_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "skipped" });
}