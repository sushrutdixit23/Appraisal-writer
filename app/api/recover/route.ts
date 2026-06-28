import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const { payment_id } = await req.json();

  if (!payment_id?.startsWith("pay_")) {
    return NextResponse.json(
      { error: "Invalid payment ID format." },
      { status: 400 }
    );
  }

  const { data } = await supabase
    .from("generations")
    .select("output, status")
    .eq("razorpay_payment_id", payment_id)
    .single();

  if (!data) {
    return NextResponse.json(
      { error: "Payment ID not found." },
      { status: 404 }
    );
  }

  if (data.status === "failed" || !data.output) {
    return NextResponse.json(
      {
        error:
          "This generation failed previously. Email support@yourdomain.com with your payment ID for a manual regeneration or refund.",
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ output: data.output });
}
