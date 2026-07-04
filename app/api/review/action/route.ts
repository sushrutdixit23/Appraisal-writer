import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

async function validateToken(supabase: any, token: string) {
  const { data: rt } = await supabase
    .from("review_tokens")
    .select("client_id, expires_at, is_revoked")
    .eq("token", token)
    .single();

  if (!rt) return null;
  if (rt.is_revoked) return null;
  if (new Date(rt.expires_at).getTime() < Date.now()) return null;

  return rt.client_id as string;
}

export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token." }, { status: 400 });

  const clientId = await validateToken(supabase, token);
  if (!clientId) return NextResponse.json({ error: "This link has expired or is no longer valid." }, { status: 401 });

  const { data: client } = await supabase
    .from("clients")
    .select("voice_name, business_name")
    .eq("id", clientId)
    .single();

  const { data: items } = await supabase
    .from("interactions")
    .select("id, type, name, role, post, text, reply, classification, temperature, temperature_reason, reasoning, created_at")
    .eq("client_id", clientId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return NextResponse.json({
    clientName: client?.voice_name || client?.business_name || "this account",
    items: items || [],
  });
}

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const { token, id, action } = await req.json();
  if (!token || !id || !action) return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  if (action !== "approve" && action !== "skip") return NextResponse.json({ error: "Invalid action." }, { status: 400 });

  const clientId = await validateToken(supabase, token);
  if (!clientId) return NextResponse.json({ error: "This link has expired or is no longer valid." }, { status: 401 });

  // Re-check the interaction actually belongs to this token's client on every
  // single action, not just at page load - the scoping has to hold even if
  // someone tries to tamper with the request body directly.
  const newStatus = action === "approve" ? "sent" : "skipped";
  const { error } = await supabase
    .from("interactions")
    .update({ status: newStatus })
    .eq("id", id)
    .eq("client_id", clientId)
    .eq("status", "pending");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ status: newStatus });
}
