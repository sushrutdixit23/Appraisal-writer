import crypto from "crypto";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();
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
    return NextResponse.json({ token: `${payload}.${sig}` });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
