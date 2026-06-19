import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const {
    full_name, email, linkedin_url, company_role,
    voice_tone, voice_signoff, voice_rules, daily_cap,
    razorpay_order_id, razorpay_payment_id, razorpay_signature,
  } = await req.json();

  // 1. Verify Razorpay signature
  const body = razorpay_order_id + "|" + razorpay_payment_id;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(body)
    .digest("hex");

  if (expected !== razorpay_signature) {
    return NextResponse.json({ error: "Payment verification failed." }, { status: 400 });
  }

  // 2. Insert client into Supabase
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .insert({
      business_name: full_name,
      linkedin_url,
      company_role,
      voice_name: full_name,
      voice_role: company_role,
      voice_tone,
      voice_signoff,
      voice_rules: voice_rules || "",
      daily_cap: parseInt(daily_cap) || 100,
      razorpay_payment_id,
      is_active: true,
    })
    .select()
    .single();

  if (clientError || !client) {
    return NextResponse.json({ error: "Failed to create client." }, { status: 500 });
  }

  return NextResponse.json({ status: "ok", client_id: client.id });
}
