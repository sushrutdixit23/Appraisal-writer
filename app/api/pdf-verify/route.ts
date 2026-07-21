import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function makeCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) out += chars[bytes[i] % chars.length];
  return out.slice(0, 4) + "-" + out.slice(4);
}

export async function POST(req: Request) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, resume } = await req.json();
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return NextResponse.json({ error: "Payments are not configured." }, { status: 500 });
    }
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: "Missing payment details." }, { status: 400 });
    }
    const expected = crypto.createHmac("sha256", keySecret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
    const valid = expected.length === razorpay_signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature));
    if (!valid) {
      console.error("PDF verify: signature mismatch for order", razorpay_order_id);
      return NextResponse.json({ error: "Payment verification failed." }, { status: 400 });
    }

    const payload = Buffer.from(JSON.stringify({ pid: razorpay_payment_id, exp: Date.now() + 2 * 60 * 60 * 1000 })).toString("base64url");
    const sig = crypto.createHmac("sha256", keySecret).update(payload).digest("hex");
    const token = `${payload}.${sig}`;

    // Best-effort recovery snapshot - payment succeeds even if this fails,
    // but the user then simply has no retrieval code, so log loudly.
    let retrievalCode: string | null = null;
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (resume?.name && supabaseUrl && serviceKey) {
        const supabase = createClient(supabaseUrl, serviceKey);
        const code = makeCode();
        const { error: insertError } = await supabase.from("paid_pdf_snapshots").insert({
          code,
          payment_id: razorpay_payment_id,
          payload: resume,
          expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        });
        if (insertError) {
          console.error("PDF verify: snapshot insert failed:", insertError.message);
        } else {
          retrievalCode = code;
        }
      }
    } catch (snapErr: any) {
      console.error("PDF verify: snapshot storage failed:", snapErr?.message || snapErr);
    }

    return NextResponse.json({ token, retrievalCode });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
