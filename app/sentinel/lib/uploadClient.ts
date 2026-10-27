"use client";

// Sentinel - sending a file to one of the read-a-file routes from the browser. A PDF over 4MB goes to Vercel Blob
// first (a serverless request body is capped at 4.5MB) and only its URL reaches our route; spreadsheets are
// small and always go directly.

import { upload } from "@vercel/blob/client";
import { supabase } from "../../lib/supabase";
import { BLOB_PATH_PREFIX } from "./extraction";

const FUNCTION_BODY_SAFE_LIMIT = 4 * 1024 * 1024;

export class UploadError extends Error {
  constructor(message: string, readonly unauthenticated = false) {
    super(message);
  }
}

export async function sendFile<T>(endpoint: string, file: File, fields: Record<string, string>): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new UploadError("Please sign in again.", true);

  let res: Response;
  if (file.size > FUNCTION_BODY_SAFE_LIMIT) {
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      throw new UploadError("Spreadsheets can be up to 4MB. Remove unused sheets or save only the statement as CSV.");
    }
    const blob = await upload(`${BLOB_PATH_PREFIX}${crypto.randomUUID()}.pdf`, file, {
      access: "public",
      handleUploadUrl: "/api/sentinel/extract-upload",
      clientPayload: JSON.stringify({ accessToken: token }),
    });
    res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ blob_url: blob.url, filename: file.name, ...fields }),
    });
  } else {
    const form = new FormData();
    form.append("file", file);
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    res = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new UploadError((body as { error?: string }).error ?? "The file could not be read.");
  return body as T;
}
