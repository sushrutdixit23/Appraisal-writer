"use client";

// Sentinel - the "upload a filing to pre-fill the form" box, shared by New Project and Manage Periods.
// It only ever fills the form: nothing is saved until a person reviews the figures and saves.

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { supabase } from "../../lib/supabase";
import { applyExtractionResult, BLOB_PATH_PREFIX, type ExtractionResult } from "./extraction";
import { T } from "./theme";
import type { Basis } from "./types";

// Vercel caps a serverless request body at 4.5MB; annual reports run 20-50MB. Anything above this goes
// to Blob storage from the browser first and only its URL reaches our route.
const FUNCTION_BODY_SAFE_LIMIT = 4 * 1024 * 1024;

export type AppliedDraft = {
  result: ExtractionResult;
  values: Record<string, string>;
  unitNote: string | null;
};

export function ExtractUpload({
  workspaceUnit,
  basis,
  onDraft,
  onError,
  onUnauthenticated,
}: {
  workspaceUnit: string | null | undefined;
  /** The basis this company is compared on - the extraction reads the statements for it. */
  basis: Basis;
  onDraft: (draft: AppliedDraft) => void;
  onError: (message: string) => void;
  onUnauthenticated: () => void;
}) {
  const [working, setWorking] = useState(false);
  const [summary, setSummary] = useState<{ notes: string | null; checks: string[]; unitNote: string | null; pages: number[] } | null>(null);

  async function handleFile(file: File) {
    onError("");
    setSummary(null);
    setWorking(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        onUnauthenticated();
        return;
      }
      let res: Response;
      if (file.size > FUNCTION_BODY_SAFE_LIMIT) {
        const blob = await upload(`${BLOB_PATH_PREFIX}${crypto.randomUUID()}.pdf`, file, {
          access: "public",
          handleUploadUrl: "/api/sentinel/extract-upload",
          clientPayload: JSON.stringify({ accessToken: token }),
        });
        res = await fetch("/api/sentinel/extract", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ blob_url: blob.url, filename: file.name, basis }),
        });
      } else {
        const form = new FormData();
        form.append("file", file);
        form.append("basis", basis);
        res = await fetch("/api/sentinel/extract", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      }
      const result = (await res.json()) as ExtractionResult & { error?: string };
      if (!res.ok) {
        onError(result.error ?? "Extraction failed.");
        return;
      }
      const { values, unitNote } = applyExtractionResult(result, workspaceUnit);
      onDraft({ result, values, unitNote });
      setSummary({ notes: result.extraction_notes, checks: result.checks ?? [], unitNote, pages: result.pages_used ?? [] });
    } catch (e) {
      onError(e instanceof Error && e.message ? e.message : "Could not reach the extraction service. Please enter the figures manually.");
    } finally {
      setWorking(false);
    }
  }

  const small: React.CSSProperties = { fontSize: "0.78rem", color: T.inkSoft, margin: "0.6rem 0 0 0", lineHeight: 1.5 };
  return (
    <div style={{ border: `1px dashed ${T.rule}`, borderRadius: 3, padding: "1rem 1.2rem", marginBottom: "1.2rem", background: T.background }}>
      <p style={{ ...small, margin: "0 0 0.6rem 0" }}>
        Optional: upload a text-based PDF filing to pre-fill the fields below. The statements for the{" "}
        <strong>{basis}</strong> basis are read, and the figures are converted to this company&apos;s reporting unit.
        Scanned or image-only PDFs are not supported - enter those manually. Nothing is saved until you review and save.
      </p>
      <label htmlFor="sentinel-extract-file" style={{ position: "absolute", left: -9999 }}>
        Upload a filing PDF
      </label>
      <input
        id="sentinel-extract-file"
        type="file"
        accept="application/pdf"
        disabled={working}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
        style={{ fontSize: "0.85rem" }}
      />
      {working && (
        <p role="status" style={{ ...small, color: T.accent }}>
          Reading filing and extracting figures...
        </p>
      )}
      {summary && !working && (
        <div role="status">
          {summary.pages.length > 0 && <p style={small}>Read statement pages: {summary.pages.join(", ")}.</p>}
          {summary.unitNote && <p style={small}>{summary.unitNote}</p>}
          {summary.notes && <p style={small}>Extraction notes: {summary.notes}</p>}
          {summary.checks.length > 0 && (
            <p style={small}>Checks that did not pass: {summary.checks.join(" ")}</p>
          )}
        </div>
      )}
    </div>
  );
}
