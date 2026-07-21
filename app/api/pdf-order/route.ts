import { NextResponse } from "next/server";

export async function POST() {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      console.error("PDF order: Razorpay keys not configured");
      return NextResponse.json({ error: "Payments are not configured." }, { status: 500 });
    }
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({ amount: 10000, currency: "INR", receipt: `pdf_${Date.now()}` }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("PDF order: Razorpay order creation failed:", JSON.stringify(data));
      return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 500 });
    }
    return NextResponse.json({ orderId: data.id, keyId, amount: 10000 });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
