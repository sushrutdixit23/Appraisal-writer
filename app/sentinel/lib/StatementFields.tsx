"use client";

// Sentinel - the statement entry fields, shared by New Project, Manage Periods and the legacy Data Entry
// page. One component means a field cannot appear on one entry path and be missing from another, and the
// same rules apply everywhere: figures can be pasted as "1,234.5" or "(123.4)", text that is not a number
// is called out instead of being silently dropped, and anything the extraction or the checks doubt is
// marked on the field itself.

import { useId, useState } from "react";
import { FIELD_SECTIONS, parseNumberInput, type FieldDef, type NumericField } from "./fields";
import { SERIF, T } from "./theme";
import type { Issue } from "./validate";

export const inputStyle: React.CSSProperties = {
  width: "100%",
  fontFamily: "inherit",
  fontSize: "0.9rem",
  padding: "0.55rem 0.7rem",
  border: `1px solid ${T.rule}`,
  borderRadius: 3,
  background: T.card,
  color: T.ink,
  boxSizing: "border-box",
};

export const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.7rem",
  fontWeight: 500,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: T.inkSoft,
  marginBottom: "0.3rem",
};

export function Field({
  label,
  htmlFor,
  children,
  span2,
  labelExtra,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  span2?: boolean;
  /** Rendered beside the label, e.g. an (i) toggle for a formula or source note. */
  labelExtra?: React.ReactNode;
}) {
  return (
    // min-width: 0 so a long, unbreakable line further down this cell (a source citation, a formula) cannot
    // force this column's grid track wider than its share of the row - the classic CSS Grid "blowout", seen
    // here as every box in one column stretching to fit the longest note in the whole form.
    <div style={{ gridColumn: span2 ? "span 2" : undefined, minWidth: 0 }}>
      {/* The toggle sits beside the <label>, not inside it - a nested interactive element would be read as
          part of the label's own text (breaking "getByLabel"-style lookups, which match on that text) and
          would fire twice on a click in some browsers (once for itself, once for the label's own target). */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.35rem" }}>
        <label htmlFor={htmlFor} style={labelStyle}>
          {label}
        </label>
        {labelExtra}
      </div>
      {children}
    </div>
  );
}

type Props = {
  values: Record<string, string>;
  onChange: (key: NumericField, value: string) => void;
  /** Fields the extraction or its checks are unsure about. */
  verify?: string[];
  /** Findings from validateStatement, shown against the fields they concern. */
  issues?: Issue[];
  /** Where each filled figure came from (the line of the file), shown under the field. */
  sources?: Record<string, string>;
  /** Unit label for the section headings, e.g. "₹ crore". */
  unitLabel: string;
  disabled?: boolean;
};

const infoBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "1rem",
  height: "1rem",
  lineHeight: 1,
  fontSize: "0.62rem",
  fontWeight: 700,
  fontStyle: "italic",
  borderRadius: "50%",
  border: `1px solid ${T.inkSoft}`,
  color: T.inkSoft,
  background: "transparent",
  cursor: "pointer",
  padding: 0,
  textTransform: "none",
  letterSpacing: "normal",
  flexShrink: 0,
};

export function StatementFields({ values, onChange, verify = [], issues = [], sources = {}, unitLabel, disabled }: Props) {
  const uid = useId();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const issueFields = new Map<string, Issue[]>();
  for (const issue of issues) for (const f of issue.fields) issueFields.set(f, [...(issueFields.get(f) ?? []), issue]);

  function renderField(f: FieldDef, span2?: boolean) {
    const raw = values[f.key] ?? "";
    const typedButInvalid = raw.trim() !== "" && parseNumberInput(raw).invalid;
    const doubted = verify.includes(f.key);
    const flagged = (issueFields.get(f.key) ?? []).some((i) => i.severity === "error");
    const id = `${uid}-${f.key}`;
    // Oxblood is a real problem (an unreadable figure or a failed check); ochre is this app's own
    // "pending / watch / caution" colour, so a field worth a second look reads as a flag, not an error.
    const border = typedButInvalid || flagged ? T.oxblood : doubted || issueFields.has(f.key) ? T.ochre : T.rule;
    const note = sources[f.key] && raw !== "" ? sources[f.key] : null;
    const hasInfo = Boolean(f.hint || note);
    const open = expanded.has(f.key);
    const panelId = `${id}-info`;
    return (
      <Field
        key={f.key}
        htmlFor={id}
        label={f.label + (f.required ? " *" : "") + (doubted ? " (verify)" : "")}
        span2={span2}
        labelExtra={
          hasInfo ? (
            <button
              type="button"
              data-testid={`info-toggle-${f.key}`}
              aria-expanded={open}
              aria-controls={panelId}
              aria-label={`${open ? "Hide" : "Show"} where this figure came from`}
              title="Where this figure came from"
              onClick={() => setExpanded((prev) => { const next = new Set(prev); if (next.has(f.key)) next.delete(f.key); else next.add(f.key); return next; })}
              style={infoBtnStyle}
            >
              i
            </button>
          ) : undefined
        }
      >
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          style={{ ...inputStyle, borderColor: border }}
          value={raw}
          onChange={(e) => onChange(f.key, e.target.value)}
          placeholder="0.00"
          aria-invalid={typedButInvalid || flagged ? true : undefined}
          aria-describedby={[typedButInvalid ? `${id}-error` : null, open ? panelId : null].filter(Boolean).join(" ") || undefined}
        />
        {/* A problem with what was typed is never hidden behind the (i) toggle - only the optional
            formula/source context is, so this row stays one line unless the person asks for more. */}
        {typedButInvalid && (
          <p id={`${id}-error`} style={{ fontSize: "0.7rem", color: T.oxblood, margin: "0.25rem 0 0 0", lineHeight: 1.4 }}>
            That is not a number.
          </p>
        )}
        {hasInfo && open && (
          <div id={panelId} style={{ margin: "0.25rem 0 0 0" }}>
            {f.hint && <p style={{ fontSize: "0.7rem", color: T.inkSoft, margin: 0, lineHeight: 1.4 }}>{f.hint}</p>}
            {note && (
              <p data-source-for={f.key} style={{ fontSize: "0.68rem", color: T.inkSoft, margin: f.hint ? "0.2rem 0 0 0" : 0, lineHeight: 1.35, wordBreak: "break-word" }}>
                {note}
              </p>
            )}
          </div>
        )}
      </Field>
    );
  }

  return (
    <>
      {FIELD_SECTIONS.map((section) => (
        <div key={section.id} style={{ marginBottom: "1.2rem" }}>
          <p
            style={{
              fontFamily: SERIF,
              fontSize: "0.95rem",
              fontWeight: 600,
              color: T.ink,
              margin: "0 0 0.2rem 0",
            }}
          >
            {section.title}{" "}
            <span style={{ fontFamily: "inherit", fontSize: "0.75rem", fontWeight: 400, color: T.inkSoft }}>
              ({unitLabel}
              {section.id === "income" ? "" : ", optional"})
            </span>
          </p>
          {section.id === "balance" && (
            <p style={{ fontSize: "0.75rem", color: T.inkSoft, margin: "0 0 0.7rem 0" }}>
              Unlocks the liquidity, leverage and working-capital checks.
            </p>
          )}
          {section.id === "cashflow" && (
            <p style={{ fontSize: "0.75rem", color: T.inkSoft, margin: "0 0 0.7rem 0" }}>
              Unlocks the cash-flow health check (operating cash flow against profit).
            </p>
          )}
          {section.id === "income" && <div style={{ height: "0.7rem" }} />}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            {section.fields.map((f, i) => renderField(f, section.fields.length % 2 === 1 && i === section.fields.length - 1))}
          </div>
        </div>
      ))}

      {issues.length > 0 && (
        <div
          role="status"
          style={{ background: T.accentSoft, borderLeft: `2px solid ${T.accent}`, padding: "0.7rem 0.9rem", marginBottom: "1.2rem" }}
        >
          <p style={{ fontSize: "0.75rem", fontWeight: 600, color: T.ink, margin: "0 0 0.4rem 0" }}>
            Worth checking before you save:
          </p>
          {issues.map((i, n) => (
            <p key={n} style={{ fontSize: "0.8rem", color: T.ink, margin: "0.2rem 0", lineHeight: 1.5 }}>
              {i.severity === "error" ? "Must fix: " : ""}
              {i.message}
            </p>
          ))}
        </div>
      )}
    </>
  );
}
