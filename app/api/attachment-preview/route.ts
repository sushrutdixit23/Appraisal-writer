import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { get } from "@vercel/blob";

// Private Blob URLs are not directly accessible from the browser - this route
// authenticates the request, fetches the blob server-side, and streams it back.
// Used for showing attachment preview thumbnails while drafting a post.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url." }, { status: 400 });

  try {
    const result = await get(url, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-cache",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
