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
// Falls back across both service-role key env var names in use across
// the codebase (extract/route.ts uses SUPABASE_SERVICE_ROLE_KEY;
// statement/narrative routes use SUPABASE_SERVICE_KEY) rather than
// assuming one - a "400 Invalid session" on every upload, even with a
// genuinely valid token, is the exact symptom of this admin client
// being built with an undefined key (e.g. the var set in .env.local
// for local dev but never added to Vercel's Production environment).

import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  SUPABASE_SERVICE_KEY!
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
        if (!SUPABASE_SERVICE_KEY) {
          // Distinguishes a server misconfiguration from a real auth
          // failure, so this doesn't read as "your session is bad"
          // when the actual problem is a missing env var.
          throw new Error(
            "Server misconfiguration: neither SUPABASE_SERVICE_ROLE_KEY nor SUPABASE_SERVICE_KEY is set."
          );
        }
        const { data: userData, error } = await supabaseAdmin.auth.getUser(accessToken);
        if (error || !userData.user) {
          throw new Error(`Invalid session: ${error?.message ?? "no user returned for this token"}`);
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