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

  const { id, text, attachment_data, attachment_name, attachment_type } = await req.json();
  if (!id || !text?.trim()) return NextResponse.json({ error: "Missing id or text." }, { status: 400 });

  const { data: client } = await supabase
    .from("clients")
    .select("id, unipile_account_id")
    .eq("auth_user_id", user.id)
    .single();

  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  if (!client.unipile_account_id) return NextResponse.json({ error: "LinkedIn not connected." }, { status: 400 });

  // Build multipart form data
  const formParts: [string, [string | null, string | Buffer, string?]][] = [
    ["account_id", [null, client.unipile_account_id]],
    ["text", [null, text.trim()]],
  ];

  // Add attachment if provided
  if (attachment_data && attachment_name && attachment_type) {
    const base64Data = attachment_data.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    formParts.push(["attachments", [attachment_name, buffer, attachment_type]]);
  }

  // Build FormData manually for Node.js fetch
  const boundary = "----UnipileBoundary" + Date.now();
  const parts: Buffer[] = [];

  for (const [fieldName, [filename, value, contentType]] of formParts) {
    let header = `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"`;
    if (filename) header += `; filename="${filename}"`;
    if (contentType) header += `\r\nContent-Type: ${contentType}`;
    header += "\r\n\r\n";

    parts.push(Buffer.from(header));
    parts.push(typeof value === "string" ? Buffer.from(value) : value as Buffer);
    parts.push(Buffer.from("\r\n"));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  const unipileRes = await fetch(
    `${process.env.UNIPILE_DSN}/api/v1/posts`,
    {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.UNIPILE_API_KEY!,
        "accept": "application/json",
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    }
  );

  const unipileData = await unipileRes.json();
  if (!unipileRes.ok) return NextResponse.json({ error: unipileData.detail || "Failed to publish." }, { status: 500 });

  // Mark as sent
  await supabase
    .from("interactions")
    .update({ status: "sent", reply: text.trim() })
    .eq("id", id)
    .eq("client_id", client.id);

  return NextResponse.json({ post_id: unipileData.post_id });
}
