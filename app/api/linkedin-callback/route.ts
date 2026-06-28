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

  // Check if client row already exists
  const { data: existing } = await supabase
    .from("clients")
    .select("id")
    .eq("auth_user_id", name)
    .maybeSingle();

  if (existing) {
    // Update existing client
    const { error } = await supabase
      .from("clients")
      .update({ unipile_account_id: account_id, is_active: true })
      .eq("auth_user_id", name);
    if (error) {
      console.error("Failed to update client:", error);
      return NextResponse.json({ error: "DB update failed" }, { status: 500 });
    }
  } else {
    // No client row yet — fetch profile and create one
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("auth_user_id", name)
      .maybeSingle();

    if (!profile) {
      console.error("No profile found for user:", name);
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);

    const { error } = await supabase
      .from("clients")
      .insert({
        auth_user_id: name,
        profile_id: profile.id,
        business_name: profile.full_name || "Zyntask User",
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
        unipile_account_id: account_id,
        is_active: true,
      });

    if (error) {
      console.error("Failed to create client:", error);
      return NextResponse.json({ error: "DB insert failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}

