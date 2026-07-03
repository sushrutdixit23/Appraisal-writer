import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export async function POST(req: NextRequest) {
  const internalKey = req.headers.get("x-internal-key");
  if (internalKey !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ sent: 0, reason: "Resend not configured." });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  const resend = new Resend(process.env.RESEND_API_KEY);

  const now = Date.now();
  const { data: trialClients } = await supabase
    .from("clients")
    .select("id, auth_user_id, voice_name, created_at, welcome_day2_sent, welcome_day5_sent")
    .eq("status", "trial")
    .eq("is_active", true);

  let sentCount = 0;

  for (const client of trialClients || []) {
    if (!client.created_at) continue;
    const ageMs = now - new Date(client.created_at).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const firstName = client.voice_name?.split(" ")[0] || "there";

    // Day 2: a tip to help them get more value
    if (ageDays >= 2 && !client.welcome_day2_sent) {
      try {
        const { data: userData } = await supabase.auth.admin.getUserById(client.auth_user_id);
        const email = userData?.user?.email;
        if (email) {
          await resend.emails.send({
            from: "Engage <onboarding@resend.dev>",
            to: email,
            subject: "A quick tip for your Engage trial",
            text: `Hi ${firstName},\n\nA couple of days in. Here is one thing worth doing if you have not already: check your Voice page. It shows what Engage has learned about how you write, and you can edit your tone and rules directly there.\n\nThe more you edit drafts before sending, the faster it learns. Every edit sharpens the next draft.\n\nOpen your dashboard: https://www.zyntask.in/dashboard\n\n- Engage`,
          });
          await supabase.from("clients").update({ welcome_day2_sent: true }).eq("id", client.id);
          sentCount++;
        }
      } catch (e) {
        console.error(`Failed to send day-2 email to client ${client.id}:`, e);
      }
    }

    // Day 5: trial ending soon reminder (trial is 7 days)
    if (ageDays >= 5 && !client.welcome_day5_sent) {
      try {
        const { data: userData } = await supabase.auth.admin.getUserById(client.auth_user_id);
        const email = userData?.user?.email;
        if (email) {
          await resend.emails.send({
            from: "Engage <onboarding@resend.dev>",
            to: email,
            subject: "Your trial ends in 2 days",
            text: `Hi ${firstName},\n\nYour free trial ends in a couple of days. If Engage has been useful, you can keep it running from your dashboard, no interruption to your queue or your voice profile.\n\nBasic is Rs 3,999/month. Professional, with unlimited post ideas, comment opportunities, and outcome tracking, is Rs 8,999/month.\n\nContinue here: https://www.zyntask.in/onboard\n\n- Engage`,
          });
          await supabase.from("clients").update({ welcome_day5_sent: true }).eq("id", client.id);
          sentCount++;
        }
      } catch (e) {
        console.error(`Failed to send day-5 email to client ${client.id}:`, e);
      }
    }
  }

  return NextResponse.json({ sent: sentCount });
}
