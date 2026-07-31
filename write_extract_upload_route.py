import pathlib

path = pathlib.Path("app/api/sentinel/extract-upload/route.ts")
path.parent.mkdir(parents=True, exist_ok=True)

content = r'''// Sentinel — Vercel Blob client-upload token route. Generates a scoped
// upload token so large PDFs (annual reports routinely exceed Vercel's
// hard 4.5MB serverless function body limit) go straight from the
// browser to Blob storage, never through a Function body. Auth is
// checked via clientPayload (the access token the browser's upload()
// call passes through) rather than a request header, since the
// @vercel/blob client helper controls this request itself.
//
// NOTE: uses SUPABASE_SERVICE_ROLE_KEY to match the existing
// extract/route.ts. Other Sentinel routes (statement, narrative) use
// SUPABASE_SERVICE_KEY instead - worth confirming both actually exist
// in your env, since that's a real inconsistency across the codebase,
// not something fixed here.

import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let accessToken: string | undefined;
        try {
          accessToken = clientPayload ? JSON.parse(clientPayload).accessToken : undefined;
        } catch {
          accessToken = undefined;
        }
        if (!accessToken) {
          throw new Error("Not authenticated.");
        }
        const { data: userData, error } = await supabaseAdmin.auth.getUser(accessToken);
        if (error || !userData.user) {
          throw new Error("Invalid session.");
        }
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: 100 * 1024 * 1024, // 100MB
          tokenPayload: JSON.stringify({ userId: userData.user.id }),
        };
      },
      onUploadCompleted: async () => {
        // No-op: the client makes a separate call to /api/sentinel/extract
        // with the resulting blob URL once upload() resolves in the
        // browser, rather than relying on this webhook - which requires
        // a public callback URL and won't fire reliably on localhost
        // during local dev.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload token generation failed." },
      { status: 400 }
    );
  }
}
'''

path.write_text(content, encoding="utf-8")
print(f"OK — wrote {len(content.encode('utf-8'))} bytes to {path}")