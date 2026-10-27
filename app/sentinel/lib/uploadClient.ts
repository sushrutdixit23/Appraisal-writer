"use client";

// Sentinel - sending a file to one of the read-a-file routes from the browser, in two phases for anything over
// 4MB (every real annual report): UPLOAD, straight to Vercel Blob storage from the browser, never touching our
// server; then READ, our route fetching it back and parsing it, bounded by its own maxDuration = 300 (see
// autofill/route.ts and extract/route.ts). A small file (a CSV, a short PDF) skips the upload phase and is
// read in one request.
//
// The upload phase used to have no guard at all: @vercel/blob's upload() was given no abortSignal, so a stalled
// client-side upload - on a slow connection, or a 50-100MB annual report PDF this session has actually seen -
// left the tab on "Reading..." forever with nothing in Vercel's own logs, since the server was never called.
// It now reports real progress (bytes uploaded, not a guess) and is aborted if that progress stalls, rather than
// capped at a flat duration that would be wrong for a large file on a slow line and pointless on a fast one.

import { upload } from "@vercel/blob/client";
import { supabase } from "../../lib/supabase";
import { BLOB_PATH_PREFIX } from "./extraction";

const FUNCTION_BODY_SAFE_LIMIT = 4 * 1024 * 1024;

/** The server read route's own ceiling, plus a margin - past this point the server has certainly given up even
 * if no response has arrived yet. */
export const READ_TIMEOUT_MS = 320_000;
/** No forward progress on the upload for this long means it has genuinely stalled, not just slowed down. */
export const UPLOAD_STALL_MS = 45_000;
/** A hard outer cap on the upload phase, reached only if progress keeps trickling in without ever finishing. */
export const UPLOAD_MAX_MS = 20 * 60_000;

export class UploadError extends Error {
  constructor(message: string, readonly unauthenticated = false, readonly timedOut = false) {
    super(message);
  }
}

export type SendProgress = { phase: "uploading"; loaded: number; total: number; percentage: number } | { phase: "reading" };

export type SendFileOptions = {
  signal?: AbortSignal;
  /** Overrides READ_TIMEOUT_MS / UPLOAD_STALL_MS / UPLOAD_MAX_MS. For tests only - production callers get the real values. */
  timeoutMs?: number;
  stallMs?: number;
  maxUploadMs?: number;
  /** Real upload progress, then one "reading" call when the server-side read starts. Large files only - a small
   * file goes straight to "reading" since there is no separate upload phase to report. */
  onProgress?: (p: SendProgress) => void;
};

type BlobUploadFn = (
  pathname: string,
  file: File,
  opts: {
    access: "public";
    handleUploadUrl: string;
    clientPayload: string;
    abortSignal: AbortSignal;
    onUploadProgress: (p: { loaded: number; total: number; percentage: number }) => void;
  }
) => Promise<{ url: string }>;

/** The blob upload itself: aborted if progress stalls for too long, or if it simply never finishes. Every
 * progress event resets the stall clock, so a slow-but-moving upload is never mistaken for a stuck one.
 * `uploadFn` defaults to the real @vercel/blob upload; a test passes a fake one instead of standing up a server
 * that speaks Blob's own presign-and-PUT protocol, so the timing logic here can be tested directly. */
export async function uploadToBlob(
  file: File,
  token: string,
  options: SendFileOptions,
  uploadFn: BlobUploadFn = upload as BlobUploadFn
): Promise<{ url: string }> {
  const ctrl = new AbortController();
  const maxTimer = setTimeout(() => ctrl.abort(), options.maxUploadMs ?? UPLOAD_MAX_MS);
  let stallTimer: ReturnType<typeof setTimeout> = setTimeout(() => {}, 0);
  const resetStall = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => ctrl.abort(), options.stallMs ?? UPLOAD_STALL_MS);
  };
  resetStall();
  const onOuterAbort = () => ctrl.abort();
  options.signal?.addEventListener("abort", onOuterAbort);

  try {
    return await uploadFn(`${BLOB_PATH_PREFIX}${crypto.randomUUID()}.pdf`, file, {
      access: "public",
      handleUploadUrl: "/api/sentinel/extract-upload",
      clientPayload: JSON.stringify({ accessToken: token }),
      abortSignal: ctrl.signal,
      onUploadProgress: (p) => {
        resetStall();
        options.onProgress?.({ phase: "uploading", loaded: p.loaded, total: p.total, percentage: p.percentage });
      },
    });
  } catch (e) {
    if (ctrl.signal.aborted && !options.signal?.aborted) {
      throw new UploadError(
        "The upload stopped making progress and was given up on. This can happen on a slow or unstable " +
          "connection with a large file - check your connection and try again, or try a smaller export of " +
          "just the financial statement pages.",
        false,
        true
      );
    }
    throw e;
  } finally {
    clearTimeout(maxTimer);
    clearTimeout(stallTimer);
    options.signal?.removeEventListener("abort", onOuterAbort);
  }
}

export async function sendFile<T>(
  endpoint: string,
  file: File,
  fields: Record<string, string>,
  options: SendFileOptions = {}
): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new UploadError("Please sign in again.", true);

  const readTimeout = new AbortController();
  const readTimer = setTimeout(() => readTimeout.abort(), options.timeoutMs ?? READ_TIMEOUT_MS);
  const onOuterAbort = () => readTimeout.abort();
  options.signal?.addEventListener("abort", onOuterAbort);

  try {
    let res: Response;
    if (file.size > FUNCTION_BODY_SAFE_LIMIT) {
      if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
        throw new UploadError("Spreadsheets can be up to 4MB. Remove unused sheets or save only the statement as CSV.");
      }
      const blob = await uploadToBlob(file, token, options);
      options.onProgress?.({ phase: "reading" });
      res = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ blob_url: blob.url, filename: file.name, ...fields }),
        signal: readTimeout.signal,
      });
    } else {
      options.onProgress?.({ phase: "reading" });
      const form = new FormData();
      form.append("file", file);
      for (const [k, v] of Object.entries(fields)) form.append(k, v);
      res = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form, signal: readTimeout.signal });
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
    clearTimeout(readTimer);
    options.signal?.removeEventListener("abort", onOuterAbort);
  }
}
