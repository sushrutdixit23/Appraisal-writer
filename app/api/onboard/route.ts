import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

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

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .insert({
      auth_user_id: user.id,
      profile_id: profile.id,
      business_name: profile.full_name,
      agent: "engage",
      tier,
      daily_cap,
      voice_name: profile.full_name,
      voice_role: profile.role,
      voice_tone: profile.voice_tone,
      voice_signoff: profile.voice_signoff,
      voice_rules: profile.voice_rules,
    })
    .select()
    .single();

  if (clientError || !client) {
    return NextResponse.json({ error: "Failed to create client." }, { status: 500 });
  }

  return NextResponse.json({ status: "ok", client_id: client.id });
}
