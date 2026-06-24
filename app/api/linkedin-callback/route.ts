import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const body = await req.json();
  const { status, account_id, name } = body;

  if (status !== "CREATION_SUCCESS" && status !== "RECONNECTED") {
    return NextResponse.json({ received: true });
  }

  if (!account_id || !name) {
    return NextResponse.json({ error: "Missing account_id or name" }, { status: 400 });
  }

  const { error } = await supabase
    .from("clients")
    .update({
      unipile_account_id: account_id,
      is_active: true,
    })
    .eq("auth_user_id", name);

  if (error) {
    console.error("Failed to update client with unipile_account_id:", error);
    return NextResponse.json({ error: "DB update failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
