// Sentinel — Vercel Blob client-upload token route. Generates a scoped
// upload token so large PDFs (annual reports routinely exceed Vercel's
// hard 4.5MB serverless function body limit) go straight from the
// browser to Blob storage, never through a Function body. Auth is
// checked via clientPayload (the access token the browser's upload()
// call passes through) rather than a request header, since the
// @vercel/blob client helper controls this request itself.
//
// The token is only issued for a PDF, under the sentinel-extract/ folder,
// with a random suffix so the stored URL cannot be guessed. The extract
// route refuses any blob URL outside that folder and deletes the file as
// soon as it has read it.
//
// Accepts either service-key env var name (extract/statement/narrative
// historically used different ones): a "400 Invalid session" on every
// upload, even with a genuinely valid token, is the symptom of this admin
// client being built with an undefined key.

import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { BLOB_PATH_PREFIX } from "../../../sentinel/lib/extraction";
import { getAdmin, isFailure } from "../../../sentinel/lib/server";

export async function POST(request: Request): Promise<NextResponse> {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "The request body is not valid JSON." }, { status: 400 });
  }

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
        if (!pathname.startsWith(BLOB_PATH_PREFIX) || pathname.includes("..")) {
          throw new Error("Uploads must go to the sentinel-extract folder.");
        }
        const a = getAdmin();
        if (isFailure(a)) {
          // Distinguishes a server misconfiguration from a real auth failure, so this does not read
          // as "your session is bad" when the actual problem is a missing env var.
          throw new Error(
            "Server misconfiguration: neither SUPABASE_SERVICE_ROLE_KEY nor SUPABASE_SERVICE_KEY is set."
          );
        }
        const { data: userData, error } = await a.admin.auth.getUser(accessToken);
        if (error || !userData.user) {
          throw new Error(`Invalid session: ${error?.message ?? "no user returned for this token"}`);
        }
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: 100 * 1024 * 1024, // 100MB
          addRandomSuffix: true,
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
