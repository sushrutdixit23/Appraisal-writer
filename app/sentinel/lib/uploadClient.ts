"use client";

// Sentinel - sending a file to one of the read-a-file routes from the browser. A PDF over 4MB goes to Vercel Blob
// first (a serverless request body is capped at 4.5MB) and only its URL reaches our route; spreadsheets are
// small and always go directly.
//
// Both routes this calls (autofill, extract) set maxDuration = 300 (Vercel's own ceiling on every plan), so the
// server itself gives up well inside five minutes. The request here is given the same ceiling plus a margin, so
// a genuinely stuck read becomes a clear, timed-out error - never a tab left on "Reading..." with no way to tell
// whether it is still working or has quietly died.

import { upload } from "@vercel/blob/client";
import { supabase } from "../../lib/supabase";
import { BLOB_PATH_PREFIX } from "./extraction";

const FUNCTION_BODY_SAFE_LIMIT = 4 * 1024 * 1024;

/** The server route's own ceiling, plus time for the upload itself and network latency - past this point the
 * server has certainly given up even if no response has arrived yet. */
export const READ_TIMEOUT_MS = 320_000;

export class UploadError extends Error {
  constructor(message: string, readonly unauthenticated = false, readonly timedOut = false) {
    super(message);
  }
}

export type SendFileOptions = {
  signal?: AbortSignal;
  /** Overrides READ_TIMEOUT_MS. For tests only - production callers get the real ceiling. */
  timeoutMs?: number;
};

export async function sendFile<T>(
  endpoint: string,
  file: File,
  fields: Record<string, string>,
  options: SendFileOptions = {}
): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new UploadError("Please sign in again.", true);

  const timeout = AbortController ? new AbortController() : null;
  const timer = timeout ? setTimeout(() => timeout.abort(), options.timeoutMs ?? READ_TIMEOUT_MS) : null;
  const onOuterAbort = () => timeout?.abort();
  options.signal?.addEventListener("abort", onOuterAbort);

  try {
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
        signal: timeout?.signal,
      });
    } else {
      const form = new FormData();
      form.append("file", file);
      for (const [k, v] of Object.entries(fields)) form.append(k, v);
      res = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form, signal: timeout?.signal });
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new UploadError((body as { error?: string }).error ?? "The file could not be read.");
    return body as T;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError" && !options.signal?.aborted) {
      throw new UploadError(
        "This is taking much longer than it should (over 5 minutes) and has been given up on. " +
          "Very large or image-heavy PDFs can be slow to read - try a smaller export of just the financial " +
          "statement pages, or enter this period's figures by hand.",
        false,
        true
      );
    }
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener("abort", onOuterAbort);
  }
}
