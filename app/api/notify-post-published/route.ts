import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Internal call from the orchestrator - simple shared-secret check, not user auth
  const internalKey = req.headers.get("x-internal-key");
  if (internalKey !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { client_id } = await req.json();
  if (!client_id) return NextResponse.json({ error: "client_id required." }, { status: 400 });

  const { data: client } = await supabase
    .from("clients")
    .select("auth_user_id, voice_name")
    .eq("id", client_id)
    .single();

  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  // Look up the user's email via Supabase auth admin API
  const { data: userData } = await supabase.auth.admin.getUserById(client.auth_user_id);
  const email = userData?.user?.email;

  if (!email || !process.env.RESEND_API_KEY) {
    return NextResponse.json({ sent: false, reason: "No email or Resend not configured." });
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: "Engage <onboarding@resend.dev>",
      to: email,
      subject: "Your post just went live",
      text: `Hi ${client.voice_name?.split(" ")[0] || "there"},\n\nYour post just published on LinkedIn.\n\nThe first hour matters most for reach. If you have a couple of minutes, share it with two or three people now, or reply to the first comments as they come in. Early engagement is what LinkedIn uses to decide how far to show your post.\n\nOpen your dashboard: https://www.zyntask.in/dashboard\n\n- Engage`,
    });
    return NextResponse.json({ sent: true });
  } catch (e) {
    console.error("Failed to send post-published nudge:", e);
    return NextResponse.json({ sent: false, error: String(e) });
  }
}
