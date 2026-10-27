"use client";

// Sentinel - "fill this form from a file". PDF (a text filing), CSV or Excel. The file is read by rules on the
// server - no model is called - and every figure comes back with the line it was read from, shown under the
// field. A person reviews the form and saves; nothing is written by reading a file.
//
// A model is available only as an explicit extra: when blanks remain after the rules have done their work, a
// button offers to ask an AI model to read just the blanks (the file is sent to it, and its figures are marked
// "verify"). It is never part of the default path.

import { useState } from "react";
import { ALL_FIELD_KEYS } from "./fields";
import { applyExtractionResult, type ExtractionResult } from "./extraction";
import { applyAutofillPeriod, countFields, defaultPeriod, type AppliedPeriod } from "./autofill/apply";
import type { AutofillPeriod, AutofillResult } from "./autofill/types";
import { sendFile, UploadError } from "./uploadClient";
import { T } from "./theme";
import { UNIT_OPTIONS, normaliseUnit, unitLabel, type CurrencyUnit } from "./units";
import type { Basis } from "./types";

export type AutofillApplied = { period: AutofillPeriod; applied: AppliedPeriod; result: AutofillResult };

const small: React.CSSProperties = { fontSize: "0.78rem", color: T.inkSoft, margin: "0.5rem 0 0 0", lineHeight: 1.5 };
const selectStyle: React.CSSProperties = {
  fontFamily: "inherit", fontSize: "0.8rem", padding: "0.3rem 0.5rem", border: `1px solid ${T.rule}`, borderRadius: 3, background: T.card, color: T.ink,
};

export function AutofillUpload({
  workspaceUnit,
  basis,
  fyStartMonth,
  getValues,
  onApply,
  onAiFill,
  onError,
  onUnauthenticated,
  multiHint,
}: {
  workspaceUnit: string | null | undefined;
  basis: Basis;
  fyStartMonth?: number;
  /** The form's current values, so the AI option knows which fields are still blank. */
  getValues: () => Record<string, string>;
  onApply: (a: AutofillApplied) => void;
  onAiFill: (filled: { values: Record<string, string>; sources: Record<string, string>; notes: string | null }) => void;
  onError: (message: string) => void;
  onUnauthenticated: () => void;
  /** Shown when the file holds more than one period, e.g. a link to the Import page. */
  multiHint?: React.ReactNode;
}) {
  const [working, setWorking] = useState<"" | "reading" | "ai">("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<AutofillResult | null>(null);
  const [periodKey, setPeriodKey] = useState("");
  const [fileUnit, setFileUnit] = useState<CurrencyUnit | "">("");
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [blanks, setBlanks] = useState(0);

  function apply(r: AutofillResult, key: string, unit: CurrencyUnit | "") {
    const period = r.periods.find((p) => p.key === key) ?? defaultPeriod(r);
    if (!period) return;
    const applied = applyAutofillPeriod(period, unit || null, workspaceUnit);
    setBlanks(ALL_FIELD_KEYS.filter((k) => !(k in applied.values)).length);
    onApply({ period, applied, result: r });
  }

  async function read(f: File) {
    onError("");
    setResult(null);
    setAiNote(null);
    setWorking("reading");
    try {
      const r = await sendFile<AutofillResult>("/api/sentinel/autofill", f, {
        basis,
        ...(fyStartMonth ? { fy_start_month: String(fyStartMonth) } : {}),
      });
      setFile(f);
      setResult(r);
      const first = defaultPeriod(r);
      setPeriodKey(first?.key ?? "");
      setFileUnit(r.unit.unit ?? "");
      if (first) apply(r, first.key, r.unit.unit ?? "");
    } catch (e) {
      if (e instanceof UploadError && e.unauthenticated) onUnauthenticated();
      else onError(e instanceof Error ? e.message : "The file could not be read.");
    } finally {
      setWorking("");
    }
  }

  async function askAi() {
    if (!file) return;
    setWorking("ai");
    onError("");
    try {
      const r = await sendFile<ExtractionResult>("/api/sentinel/extract", file, { basis });
      const { values, unitNote } = applyExtractionResult(r, workspaceUnit);
      const current = getValues();
      const filled: Record<string, string> = {};
      const sources: Record<string, string> = {};
      for (const k of ALL_FIELD_KEYS) {
        if ((current[k] ?? "").trim() === "" && values[k] !== undefined) {
          filled[k] = values[k];
          sources[k] = "Read by an AI model, not by rules - check it against the filing";
        }
      }
      setAiNote(
        Object.keys(filled).length === 0
          ? "The AI model found nothing more to fill."
          : `The AI model filled ${Object.keys(filled).length} blank field(s); they are marked "verify".`
      );
      onAiFill({ values: filled, sources, notes: [r.extraction_notes, unitNote].filter(Boolean).join(" ") || null });
      setBlanks((b) => Math.max(0, b - Object.keys(filled).length));
    } catch (e) {
      if (e instanceof UploadError && e.unauthenticated) onUnauthenticated();
      else onError(e instanceof Error ? e.message : "The AI reading failed.");
    } finally {
      setWorking("");
    }
  }

  const period = result?.periods.find((p) => p.key === periodKey) ?? null;
  const detected = result?.unit;

  return (
    <div style={{ border: `1px dashed ${T.rule}`, borderRadius: 3, padding: "1rem 1.2rem", marginBottom: "1.2rem", background: T.background }}>
      <p style={{ ...small, margin: "0 0 0.6rem 0" }}>
        <strong>Fill from a file.</strong> Upload a text PDF filing, a CSV or an Excel sheet. It is read by rules on the server - no AI is used -
        and each figure shows the line it came from. Nothing is saved until you review the form and save.
      </p>
      <label htmlFor="sentinel-autofill-file" style={{ position: "absolute", left: -9999 }}>Upload a PDF, CSV or Excel file</label>
      <input
        id="sentinel-autofill-file"
        type="file"
        accept=".pdf,.csv,.tsv,.txt,.xlsx,.xlsm,application/pdf,text/csv"
        disabled={working !== ""}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) read(f);
          e.target.value = "";
        }}
        style={{ fontSize: "0.85rem" }}
      />
      {working === "reading" && <p role="status" style={{ ...small, color: T.accent }}>Reading the file...</p>}
      {working === "ai" && <p role="status" style={{ ...small, color: T.accent }}>Asking the AI model to read the blanks...</p>}

      {result && working === "" && period && (
        <div role="status" data-testid="autofill-summary">
          <p style={small}>
            Read <strong>{result.source_file}</strong>
            {result.pages_used.length > 0 && <> (statement pages {result.pages_used.join(", ")})</>}
            {result.layout && <> as a sheet with {result.layout}</>}: {result.periods.length} period{result.periods.length === 1 ? "" : "s"} found.
          </p>

          {result.periods.length > 1 && (
            <p style={small}>
              <label>
                Use period{" "}
                <select
                  aria-label="Period to fill the form from"
                  style={selectStyle}
                  value={periodKey}
                  onChange={(e) => { setPeriodKey(e.target.value); apply(result, e.target.value, fileUnit); }}
                >
                  {result.periods.map((p) => (
                    <option key={p.key} value={p.key}>
                      {(p.period_label ?? "Unlabelled")} {p.basis ? `(${p.basis})` : ""} - {countFields(p)} figures
                    </option>
                  ))}
                </select>
              </label>
              {multiHint && <> {multiHint}</>}
            </p>
          )}

          <p style={small}>
            <label>
              File unit{" "}
              <select
                aria-label="Unit the file uses"
                style={selectStyle}
                value={fileUnit}
                onChange={(e) => { const u = e.target.value as CurrencyUnit | ""; setFileUnit(u); apply(result, periodKey, u); }}
              >
                <option value="">Not stated - enter as printed</option>
                {UNIT_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </label>{" "}
            {detected?.unit
              ? `read from the file: "${detected.evidence}"${detected.ambiguous ? " (more than one unit is mentioned; check it)" : ""}`
              : "the file does not say; choose it if it is not this company's unit"}
            {fileUnit && normaliseUnit(workspaceUnit) !== fileUnit && <> . Figures are converted to {unitLabel(workspaceUnit)}.</>}
          </p>

          {[...result.notes, ...period.notes].map((n, i) => <p key={i} style={small}>{n}</p>)}
          {period.issues.length > 0 && (
            <p style={{ ...small, color: T.ink }}>
              Checks that did not pass: {period.issues.map((i) => i.message).join(" ")}
            </p>
          )}

          {result.kind === "pdf" && blanks > 0 && (
            <p style={small}>
              {blanks} field(s) are still blank. If the file has them, an AI model can try to read just those - the file is sent to it,
              and the figures it returns are marked &quot;verify&quot;.{" "}
              <button type="button" onClick={askAi} style={{ ...selectStyle, cursor: "pointer", marginLeft: 4 }}>
                Fill the blanks with AI
              </button>
            </p>
          )}
          {aiNote && <p style={small}>{aiNote}</p>}
        </div>
      )}
    </div>
  );
}
