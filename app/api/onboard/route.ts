import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { Resend } from "resend";

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  const {
    tier, daily_cap,
    razorpay_order_id, razorpay_payment_id, razorpay_signature,
  } = await req.json();

  const body = razorpay_order_id + "|" + razorpay_payment_id;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(body)
    .digest("hex");

  if (expected !== razorpay_signature) {
    return NextResponse.json({ error: "Payment verification failed." }, { status: 400 });
  }

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }

  // Check for an existing client row (from self-serve LinkedIn connect) instead of blindly inserting
  const { data: existingClient } = await supabase
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  let client;
  let clientError;

  if (existingClient) {
    // Upgrade the existing trial client to paid
    const result = await supabase
      .from("clients")
      .update({
        tier,
        daily_cap,
        status: "active",
        is_active: true,
        razorpay_payment_id,
      })
      .eq("id", existingClient.id)
      .select()
      .single();
    client = result.data;
    clientError = result.error;
  } else {
    // No prior client row - create fresh (fallback path, e.g. if LinkedIn wasn't connected yet)
    const result = await supabase
      .from("clients")
      .insert({
        auth_user_id: user.id,
        profile_id: profile.id,
        business_name: profile.full_name,
        agent: "engage",
        tier,
        daily_cap,
        status: "active",
        is_active: true,
        razorpay_payment_id,
        voice_name: profile.full_name,
        voice_role: profile.role,
        voice_tone: profile.voice_tone,
        voice_signoff: profile.voice_signoff,
        voice_rules: profile.voice_rules,
      })
      .select()
      .single();
    client = result.data;
    clientError = result.error;
  }

  if (clientError || !client) {
    return NextResponse.json({ error: "Failed to update client." }, { status: 500 });
  }

  // Notify founder of the payment
  if (process.env.RESEND_API_KEY && process.env.FOUNDER_EMAIL) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: "Zyntask <onboarding@resend.dev>",
        to: process.env.FOUNDER_EMAIL,
        subject: `Payment received: ${profile.full_name} - ${tier}`,
        text: `${profile.full_name} just paid for Engage.\n\nTier: ${tier}\nRazorpay payment ID: ${razorpay_payment_id}\nRole: ${profile.role || "not specified"}\nLinkedIn: ${profile.linkedin_url || "not specified"}\n\nView in Supabase or Razorpay dashboard for full details.`,
      });
    } catch (e) {
      console.error("Failed to send founder payment notification email:", e);
    }
  }

  return NextResponse.json({ status: "ok", client_id: client.id });
}
