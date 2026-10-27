"use client";

// Sentinel - the statement entry fields, shared by New Project, Manage Periods and the legacy Data Entry
// page. One component means a field cannot appear on one entry path and be missing from another, and the
// same rules apply everywhere: figures can be pasted as "1,234.5" or "(123.4)", text that is not a number
// is called out instead of being silently dropped, and anything the extraction or the checks doubt is
// marked on the field itself.

import { useId } from "react";
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
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  span2?: boolean;
}) {
  return (
    <div style={{ gridColumn: span2 ? "span 2" : undefined }}>
      <label htmlFor={htmlFor} style={labelStyle}>
        {label}
      </label>
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
  /** Unit label for the section headings, e.g. "₹ crore". */
  unitLabel: string;
  disabled?: boolean;
};

export function StatementFields({ values, onChange, verify = [], issues = [], unitLabel, disabled }: Props) {
  const uid = useId();
  const issueFields = new Map<string, Issue[]>();
  for (const issue of issues) for (const f of issue.fields) issueFields.set(f, [...(issueFields.get(f) ?? []), issue]);

  function renderField(f: FieldDef) {
    const raw = values[f.key] ?? "";
    const typedButInvalid = raw.trim() !== "" && parseNumberInput(raw).invalid;
    const doubted = verify.includes(f.key);
    const flagged = (issueFields.get(f.key) ?? []).some((i) => i.severity === "error");
    const id = `${uid}-${f.key}`;
    const border = typedButInvalid || flagged ? "#B3261E" : doubted || issueFields.has(f.key) ? T.accent : T.rule;
    return (
      <Field
        key={f.key}
        htmlFor={id}
        label={f.label + (f.required ? " *" : "") + (doubted ? " (verify)" : "")}
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
          aria-describedby={f.hint || typedButInvalid ? `${id}-hint` : undefined}
        />
        {(f.hint || typedButInvalid) && (
          <p
            id={`${id}-hint`}
            style={{ fontSize: "0.7rem", color: typedButInvalid ? "#B3261E" : T.inkSoft, margin: "0.25rem 0 0 0", lineHeight: 1.4 }}
          >
            {typedButInvalid ? "That is not a number." : f.hint}
          </p>
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
            {section.fields.map(renderField)}
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
