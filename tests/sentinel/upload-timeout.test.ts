// uploadClient's own timeout: a read that never answers must become a clear, timed-out error, not an
// indefinitely pending promise - the bug behind the Import page hanging on "Reading..." for 5+ minutes with
// nothing on screen to say whether it was still working.
//
// supabase.auth.getSession() is monkeypatched for these tests: the browser client has no real session in
// Node, and sendFile's very first line needs one before it will do anything else.

import test, { after, afterEach, before } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { supabase } from "../../app/lib/supabase";
import { sendFile, UploadError } from "../../app/sentinel/lib/uploadClient";
import * as autofillRoute from "../../app/api/sentinel/autofill/route";
import * as extractRoute from "../../app/api/sentinel/extract/route";

type Auth = typeof supabase.auth;
const realGetSession = supabase.auth.getSession.bind(supabase.auth);

function fakeSignedIn() {
  (supabase.auth as Auth).getSession = (async () => ({
    data: { session: { access_token: "tok" } },
    error: null,
  })) as Auth["getSession"];
}
function fakeSignedOut() {
  (supabase.auth as Auth).getSession = (async () => ({ data: { session: null }, error: null })) as Auth["getSession"];
}
afterEach(() => {
  (supabase.auth as Auth).getSession = realGetSession;
});

function serveOnce(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ url: `http://127.0.0.1:${port}/`, close: () => server.close() });
    });
  });
}
const file = (name = "report.csv") => new File(["revenue,1000\n"], name, { type: "text/csv" });

test("a quick, successful read resolves normally", async () => {
  fakeSignedIn();
  const srv = await serveOnce((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  try {
    const body = await sendFile<{ ok: boolean }>(srv.url, file(), {});
    assert.deepEqual(body, { ok: true });
  } finally {
    srv.close();
  }
});

test("no session at all is refused before any request is sent", async () => {
  fakeSignedOut();
  let requested = false;
  const srv = await serveOnce((req, res) => {
    requested = true;
    res.end("{}");
  });
  try {
    await assert.rejects(sendFile(srv.url, file(), {}), (e) => e instanceof UploadError && e.unauthenticated);
    assert.equal(requested, false);
  } finally {
    srv.close();
  }
});

test("a server that never answers times out with a clear, specific error rather than hanging forever", async () => {
  fakeSignedIn();
  const srv = await serveOnce(() => {
    /* never respond, never close the connection */
  });
  try {
    await assert.rejects(
      sendFile(srv.url, file(), {}, { timeoutMs: 80 }),
      (e: unknown) => e instanceof UploadError && e.timedOut === true && /taking much longer/.test(e.message)
    );
  } finally {
    srv.close();
  }
});

test("the caller's own cancellation is a plain abort, not disguised as a timeout", async () => {
  fakeSignedIn();
  const srv = await serveOnce(() => {
    /* never respond */
  });
  const outer = new AbortController();
  const promise = sendFile(srv.url, file(), {}, { signal: outer.signal, timeoutMs: 60_000 });
  outer.abort();
  try {
    await assert.rejects(promise, (e: unknown) => !(e instanceof UploadError));
  } finally {
    srv.close();
  }
});

test("a server error response still surfaces its own message, unaffected by the timeout plumbing", async () => {
  fakeSignedIn();
  const srv = await serveOnce((req, res) => {
    res.writeHead(422, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "That file is not a recognised format." }));
  });
  try {
    await assert.rejects(sendFile(srv.url, file(), {}), (e: unknown) => e instanceof UploadError && e.message === "That file is not a recognised format." && !e.timedOut);
  } finally {
    srv.close();
  }
});

test("the autofill and extract routes both declare the 300s ceiling Vercel allows on every plan", () => {
  assert.equal(autofillRoute.maxDuration, 300);
  assert.equal(extractRoute.maxDuration, 300);
});

// --- the upload phase itself: stall detection and the hard outer cap -------------------------
//
// uploadToBlob is tested directly with a fake upload function (not a real @vercel/blob round trip, which would
// mean reimplementing its presign-and-PUT protocol just to test timing), so these exercise the actual stall and
// cap logic rather than guessing at it indirectly through sendFile.

import { uploadToBlob } from "../../app/sentinel/lib/uploadClient";

/** A fake file of a real size, so a progress event's loaded/total ratio means something - the 13-byte `file()`
 * helper above made every one of these tests' first progress call look like 100% (loaded >> total), which is
 * exactly the production bug this file exists to catch: it silently defeated the stall test it was written
 * for. */
const bigFile = (name: string, size = 10_000_000) => new File([new Uint8Array(size)], name, { type: "application/pdf" });

function neverResolves(
  onProgress: (loaded: number, total: number) => void,
  schedule: number[], // delays, in ms, at which to call onProgress once each
  loadedAt: (i: number, total: number) => number = (i, total) => Math.min(total - 1, (i + 1) * 1000) // stays under 100%
): Parameters<typeof uploadToBlob>[3] {
  return (_pathname, file, opts) =>
    new Promise((_resolve, reject) => {
      const timers = schedule.map((delay, i) =>
        setTimeout(() => {
          const loaded = loadedAt(i, file.size);
          onProgress(loaded, file.size);
          opts.onUploadProgress({ loaded, total: file.size, percentage: (loaded * 100) / file.size });
        }, delay)
      );
      opts.abortSignal.addEventListener("abort", () => {
        timers.forEach(clearTimeout);
        reject(new DOMException("aborted", "AbortError"));
      });
    });
}

test("a stalled upload (no progress event for stallMs, still under 100%) is given up on with a clear message", async () => {
  const fn = neverResolves(() => {}, [10]); // one progress event at 10ms, well under 100%, then nothing
  await assert.rejects(
    uploadToBlob(bigFile("big.pdf"), "tok", { stallMs: 60, maxUploadMs: 10_000 }, fn),
    (e: unknown) => e instanceof UploadError && e.timedOut === true && /stopped making progress/.test(e.message)
  );
});

test("a slow but steadily progressing upload is never mistaken for stalled", async () => {
  // progress every 30ms, stall threshold 60ms - each event arrives well inside the window, so it should run on
  let calls = 0;
  const fn = neverResolves(() => { calls++; }, [20, 50, 80, 110]);
  const result = await Promise.race([
    uploadToBlob(bigFile("big.pdf"), "tok", { stallMs: 60, maxUploadMs: 10_000 }, fn),
    new Promise((resolve) => setTimeout(() => resolve({ raced: true }), 150)),
  ]);
  assert.deepEqual(result, { raced: true }); // still running at 150ms - not aborted as stalled
  assert.equal(calls, 4);
});

test("once a progress event reports the file fully queued (loaded >= total), the stall clock stops being armed - only the overall cap can still end it", async () => {
  // Mirrors the production bug: the local side reports 100% almost immediately (one event, well under stallMs),
  // then genuinely nothing more happens - the real network transfer and server ack produce no progress event of
  // their own. A naive stall timer would (and did) call this "stalled" long before the upload actually failed.
  const fn: Parameters<typeof uploadToBlob>[3] = (_p, f, opts) =>
    new Promise((_resolve, reject) => {
      setTimeout(() => opts.onUploadProgress({ loaded: f.size, total: f.size, percentage: 100 }), 5);
      opts.abortSignal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  const stillRunning = await Promise.race([
    uploadToBlob(bigFile("big.pdf"), "tok", { stallMs: 30, maxUploadMs: 5_000 }, fn),
    new Promise((resolve) => setTimeout(() => resolve({ raced: true }), 100)), // well past stallMs=30
  ]);
  assert.deepEqual(stillRunning, { raced: true }, "a 30ms stall threshold must not abort a fully-queued upload that is still legitimately finishing");

  // and it does still end, eventually, via the unconditional outer cap - this is not "never times out again"
  await assert.rejects(uploadToBlob(bigFile("big.pdf"), "tok", { stallMs: 30, maxUploadMs: 80 }, fn), UploadError);
});

test("continuous progress that never actually finishes still gives up at the hard cap", async () => {
  // a progress event every 20ms forever (never stalls) - only maxUploadMs should end it
  const fn: Parameters<typeof uploadToBlob>[3] = (_p, f, opts) => {
    const id = setInterval(() => opts.onUploadProgress({ loaded: 1, total: f.size, percentage: 1 }), 20);
    return new Promise((_resolve, reject) => {
      opts.abortSignal.addEventListener("abort", () => {
        clearInterval(id);
        reject(new DOMException("aborted", "AbortError"));
      });
    });
  };
  const started = Date.now();
  await assert.rejects(uploadToBlob(bigFile("big.pdf"), "tok", { stallMs: 10_000, maxUploadMs: 100 }, fn), UploadError);
  assert.ok(Date.now() - started < 1000, "should have given up at the 100ms cap, not run away");
});

test("a successful upload resolves with the blob url, forwarding every progress event", async () => {
  const seen: number[] = [];
  const fn: Parameters<typeof uploadToBlob>[3] = async (_p, f, opts) => {
    opts.onUploadProgress({ loaded: f.size / 2, total: f.size, percentage: 50 });
    opts.onUploadProgress({ loaded: f.size, total: f.size, percentage: 100 });
    return { url: "https://example.public.blob.vercel-storage.com/done.pdf" };
  };
  const result = await uploadToBlob(bigFile("big.pdf"), "tok", { onProgress: (p) => p.phase === "uploading" && seen.push(p.percentage) }, fn);
  assert.equal(result.url, "https://example.public.blob.vercel-storage.com/done.pdf");
  assert.deepEqual(seen, [50, 100]);
});

test("the caller's own cancellation during upload is a plain abort, not the stall message", async () => {
  const fn: Parameters<typeof uploadToBlob>[3] = (_p, _f, opts) =>
    new Promise((_resolve, reject) => opts.abortSignal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  const outer = new AbortController();
  const promise = uploadToBlob(bigFile("big.pdf"), "tok", { signal: outer.signal, stallMs: 10_000 }, fn);
  setTimeout(() => outer.abort(), 10);
  await assert.rejects(promise, (e: unknown) => !(e instanceof UploadError));
});
