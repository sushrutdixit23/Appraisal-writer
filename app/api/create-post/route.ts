import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { get, del } from "@vercel/blob";

type AttachmentRef = { url: string; name: string; type: string };

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

  const { id, text, attachments } = await req.json() as {
    id: string; text: string; attachments?: AttachmentRef[];
  };
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

  // Fetch each attachment server-side from Blob (private store, so requires the SDK's get())
  // and add it as its own multipart part. Unbounded body size is no longer a concern here -
  // this route only ever receives small Blob URL references, never raw file bytes.
  if (Array.isArray(attachments) && attachments.length > 0) {
    for (const att of attachments) {
      if (!att?.url || !att?.name || !att?.type) continue;
      try {
        const result = await get(att.url, { access: "private" });
        if (!result || result.statusCode !== 200 || !result.stream) {
          return NextResponse.json({ error: `Could not read attachment: ${att.name}` }, { status: 500 });
        }
        const arrayBuffer = await new Response(result.stream).arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        formParts.push(["attachments", [att.name, buffer, att.type]]);
      } catch {
        return NextResponse.json({ error: `Could not read attachment: ${att.name}` }, { status: 500 });
      }
    }
  }

  // Build FormData manually for Node.js fetch (unchanged from before)
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

  // Best-effort cleanup: the files are now forwarded to LinkedIn via Unipile,
  // so there's no reason to keep them in Blob storage. Failures here are non-fatal.
  if (Array.isArray(attachments)) {
    for (const att of attachments) {
      if (att?.url) del(att.url).catch(() => {});
    }
  }

  await supabase
    .from("interactions")
    .update({ status: "sent", reply: text.trim() })
    .eq("id", id)
    .eq("client_id", client.id);

  return NextResponse.json({ post_id: unipileData.post_id });
}
