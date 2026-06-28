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

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found. Complete setup first." }, { status: 404 });

  // Check if client already exists
  const { data: existing } = await supabase
    .from("clients")
    .select("id, status")
    .eq("auth_user_id", user.id)
    .single();

  if (existing) {
    return NextResponse.json({ status: "ok", client_id: existing.id, already_exists: true, client_status: existing.status });
  }

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 7);

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .insert({
      auth_user_id: user.id,
      profile_id: profile.id,
      business_name: profile.full_name,
      agent: "engage",
      tier: "trial",
      status: "trial",
      daily_cap: 50,
      trial_ends_at: trialEndsAt.toISOString(),
      trial_replies_used: 0,
      voice_name: profile.full_name,
      voice_role: profile.role,
      voice_tone: profile.voice_tone,
      voice_signoff: profile.voice_signoff,
      voice_rules: profile.voice_rules,
      linkedin_url: profile.linkedin_url,
      is_active: false,
    })
    .select()
    .single();

  if (clientError || !client) {
    return NextResponse.json({ error: "Failed to start trial." }, { status: 500 });
  }

  return NextResponse.json({
    status: "ok",
    client_id: client.id,
    trial_ends_at: client.trial_ends_at,
  });
}

