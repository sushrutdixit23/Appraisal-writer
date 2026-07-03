import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const payload = await req.json();
  console.log("Unipile webhook received:", JSON.stringify(payload));

  const { status, account_id, name: authUserId } = payload;

  if (status !== "CREATION_SUCCESS" || !account_id || !authUserId) {
    return NextResponse.json({ received: true, processed: false });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", authUserId)
    .single();

  if (!profile) {
    console.error("No profile found for auth_user_id:", authUserId);
    return NextResponse.json({ received: true, processed: false, error: "Profile not found" });
  }

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

  if (isNewClient && process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const firstName = profile.full_name?.split(" ")[0] || "there";

    // Founder notification
    if (process.env.FOUNDER_EMAIL) {
      try {
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

    // Day 0 welcome email to the user
    try {
      const { data: userData } = await supabase.auth.admin.getUserById(authUserId);
      const userEmail = userData?.user?.email;
      if (userEmail) {
        await resend.emails.send({
          from: "Engage <onboarding@resend.dev>",
          to: userEmail,
          subject: "Your Engage trial has started",
          text: `Hi ${firstName},\n\nYour LinkedIn is connected and your free trial has started. One week, full access.\n\nHere is what happens next: Engage is reading your recent messages and comments right now, and drafting replies in your voice. Give it a couple of minutes, then open your dashboard to see your first queue.\n\nA good first step: draft your first post. Go to the Posts tab and hit "Draft a post" - you can ask for post ideas if you are not sure what to write about.\n\nOpen your dashboard: https://www.zyntask.in/dashboard\n\n- Engage`,
        });
      }
    } catch (e) {
      console.error("Failed to send day-0 welcome email:", e);
    }
  }

  return NextResponse.json({ received: true, processed: true });
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}
