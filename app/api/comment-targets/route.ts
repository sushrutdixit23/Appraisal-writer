import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

async function getClientForUser(supabase: any, req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return null;
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  return client;
}

export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const client = await getClientForUser(supabase, req);
  if (!client) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data, error } = await supabase
    .from("comment_targets")
    .select("id, display_name, linkedin_identifier, is_active, created_at")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ targets: data || [] });
}

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const client = await getClientForUser(supabase, req);
  if (!client) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { display_name, linkedin_identifier } = await req.json();
  if (!display_name?.trim() || !linkedin_identifier?.trim()) {
    return NextResponse.json({ error: "Name and LinkedIn URL are required." }, { status: 400 });
  }

  // Accept either a full URL or a bare slug - normalize to just the slug,
  // since that is what the resolver on the backend expects.
  let identifier = linkedin_identifier.trim();
  const urlMatch = identifier.match(/linkedin\.com\/in\/([^\/\?]+)/i);
  if (urlMatch) identifier = urlMatch[1];

  const { data, error } = await supabase
    .from("comment_targets")
    .insert({
      id: randomUUID(),
      client_id: client.id,
      display_name: display_name.trim(),
      linkedin_identifier: identifier,
      is_active: true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ target: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const client = await getClientForUser(supabase, req);
  if (!client) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const { error } = await supabase
    .from("comment_targets")
    .delete()
    .eq("id", id)
    .eq("client_id", client.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: true });
}
