import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse, NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        // Authenticate the user before issuing an upload token.
        // Without this check, anyone could upload arbitrary files to the store.
        const authHeader = request.headers.get("authorization");
        const token = authHeader?.replace("Bearer ", "");
        if (!token) throw new Error("Not authenticated.");

        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_KEY!
        );
        const { data: { user } } = await supabase.auth.getUser(token);
        if (!user) throw new Error("Not authenticated.");

        return {
          allowedContentTypes: [
            "image/jpeg", "image/png", "image/webp", "image/gif",
            "video/mp4", "video/quicktime", "video/webm",
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ],
          // Matches Unipile's documented 15MB attachment limit
          maximumSizeInBytes: 15 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: user.id }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Not persisting anything here - the attachment is only meaningful
        // once attached to a draft and approved, which happens via create-post.
        // This callback also won't fire on localhost without a tunnel (e.g. ngrok).
        console.log("Blob upload completed:", blob.url, tokenPayload);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
