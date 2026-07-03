import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

// This route is called by Unipile (no user auth header - verify via shared knowledge of expected payload shape)
export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const payload = await req.json();
  console.log("Unipile webhook received:", JSON.stringify(payload));

  // Expected payload: { status: "CREATION_SUCCESS", account_id: "...", name: "<auth_user_id>" }
  const { status, account_id, name: authUserId } = payload;

  if (status !== "CREATION_SUCCESS" || !account_id || !authUserId) {
    return NextResponse.json({ received: true, processed: false });
  }

  // Get the profile we created during setup
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", authUserId)
    .single();

  if (!profile) {
    console.error("No profile found for auth_user_id:", authUserId);
    return NextResponse.json({ received: true, processed: false, error: "Profile not found" });
  }

  // Fetch the connected LinkedIn profile to get a display picture / id (optional, best-effort)
  let unipileProfileId: string | null = null;
  try {
    const profileRes = await fetch(
      `${process.env.UNIPILE_DSN}/api/v1/accounts/${account_id}`,
      { headers: { "X-API-KEY": process.env.UNIPILE_API_KEY!, "accept": "application/json" } }
    );
    if (profileRes.ok) {
      const profileData = await profileRes.json();
      unipileProfileId = profileData?.connection_params?.im?.id || null;
    }
  } catch (e) {
    console.error("Failed to fetch unipile profile id:", e);
  }

  const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Check if a client row already exists for this user (e.g. reconnect case)
  const { data: existingClient } = await supabase
    .from("clients")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  const isNewClient = !existingClient;

  if (existingClient) {
    await supabase
      .from("clients")
      .update({
        unipile_account_id: account_id,
        unipile_profile_id: unipileProfileId,
        is_active: true,
      })
      .eq("id", existingClient.id);
  } else {
    await supabase.from("clients").insert({
      auth_user_id: authUserId,
      business_name: profile.full_name,
      voice_name: profile.full_name,
      voice_role: profile.role,
      voice_tone: profile.voice_tone,
      voice_signoff: profile.voice_signoff,
      voice_rules: profile.voice_rules,
      linkedin_url: profile.linkedin_url,
      unipile_account_id: account_id,
      unipile_profile_id: unipileProfileId,
      daily_cap: 50,
      is_active: true,
      agent: "engage",
      tier: "trial",
      status: "trial",
      trial_ends_at: trialEndsAt,
      trial_replies_used: 0,
      profile_id: profile.id,
    });
  }

  // Notify founder on genuinely new signups only (not reconnects)
  if (isNewClient && process.env.RESEND_API_KEY && process.env.FOUNDER_EMAIL) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: "Zyntask <onboarding@resend.dev>",
        to: process.env.FOUNDER_EMAIL,
        subject: `New Engage trial: ${profile.full_name}`,
        text: `${profile.full_name} just connected their LinkedIn and started a free trial.\n\nRole: ${profile.role || "not specified"}\nLinkedIn: ${profile.linkedin_url || "not specified"}\nTrial ends: ${new Date(trialEndsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}\n\nView in Supabase to see full details.`,
      });
    } catch (e) {
      console.error("Failed to send founder notification email:", e);
    }
  }

  return NextResponse.json({ received: true, processed: true });
}

// Unipile may also send a GET for verification - respond OK
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
