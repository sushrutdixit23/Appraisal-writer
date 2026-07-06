import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data: client } = await supabase
    .from("clients")
    .select("id, unipile_account_id, unipile_profile_id")
    .eq("auth_user_id", user.id)
    .single();

  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  if (!client.unipile_account_id || !client.unipile_profile_id) {
    return NextResponse.json({ error: "LinkedIn account not connected yet." }, { status: 400 });
  }

  const DSN = process.env.UNIPILE_DSN;
  const API_KEY = process.env.UNIPILE_API_KEY;
  const headers = { "X-API-KEY": API_KEY!, "accept": "application/json" };

  try {
    // Fetch the About section from the profile
    const profileRes = await fetch(
      `${DSN}/api/v1/users/${client.unipile_profile_id}?account_id=${client.unipile_account_id}&linkedin_sections=about`,
      { headers }
    );
    if (!profileRes.ok) {
      const errText = await profileRes.text();
      return NextResponse.json({ error: `LinkedIn profile fetch failed: ${errText.slice(0, 200)}` }, { status: 502 });
    }
    const profile = await profileRes.json();
    const about = profile.summary || "";

    // Fetch the last 3 posts
    const postsRes = await fetch(
      `${DSN}/api/v1/users/${client.unipile_profile_id}/posts?account_id=${client.unipile_account_id}&limit=3`,
      { headers }
    );
    if (!postsRes.ok) {
      const errText = await postsRes.text();
      return NextResponse.json({ error: `LinkedIn posts fetch failed: ${errText.slice(0, 200)}` }, { status: 502 });
    }
    const postsData = await postsRes.json();
    const recentPosts = (postsData.items || [])
      .map((p: any) => p.text)
      .filter((t: string) => t && t.trim().length > 0)
      .slice(0, 3);

    await supabase
      .from("clients")
      .update({ linkedin_about: about, linkedin_recent_posts: recentPosts })
      .eq("id", client.id);

    return NextResponse.json({ about, recentPosts });
  } catch (e: any) {
    return NextResponse.json({ error: `Could not reach LinkedIn: ${e.message}` }, { status: 500 });
  }
}
