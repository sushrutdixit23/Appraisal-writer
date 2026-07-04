import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

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

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  // Revoke any existing active links for this client before issuing a new one,
  // so there is only ever one live link at a time - simpler to reason about
  // than tracking multiple simultaneous tokens per client.
  await supabase
    .from("review_tokens")
    .update({ is_revoked: true })
    .eq("client_id", client.id)
    .eq("is_revoked", false);

  const reviewToken = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from("review_tokens")
    .insert({ client_id: client.id, token: reviewToken, expires_at: expiresAt });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ token: reviewToken, expiresAt });
}
