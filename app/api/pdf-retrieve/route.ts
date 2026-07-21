import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { code } = await req.json();
    const normalized = String(code || "").trim().toUpperCase();
    if (!/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(normalized)) {
      return NextResponse.json({ error: "That doesn't look like a valid code. Format: XXXX-XXXX" }, { status: 400 });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!supabaseUrl || !serviceKey || !keySecret) {
      console.error("PDF retrieve: missing configuration");
      return NextResponse.json({ error: "Retrieval is not configured." }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data, error } = await supabase
      .from("paid_pdf_snapshots")
      .select("payload, expires_at")
      .eq("code", normalized)
      .maybeSingle();

    if (error) {
      console.error("PDF retrieve: lookup failed:", error.message);
      return NextResponse.json({ error: "Lookup failed. Please try again." }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "No download found for this code. Check for typos." }, { status: 404 });
    }
    if (new Date(data.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "This code has expired (codes last 48 hours). Contact support@zyntask.in with your payment details." }, { status: 410 });
    }

    const payload = Buffer.from(JSON.stringify({ pid: "retrieval", exp: Date.now() + 15 * 60 * 1000 })).toString("base64url");
    const sig = crypto.createHmac("sha256", keySecret).update(payload).digest("hex");

    return NextResponse.json({ resume: data.payload, token: `${payload}.${sig}` });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
