// Sentinel autofill - from what the files held to a list of periods ready to import. Pure.
//
// One row per period per file, each run through the same checks a typed period gets (prepareFromForm), then
// compared with what the project already has:
//
//   new        not on file: ticked by default
//   replace    the same period and basis is on file: NOT ticked by default - an import must not quietly overwrite
//              figures somebody corrected by hand
//   blocked    cannot be saved as it stands (period not identified, a check failed): the reasons are listed
//   duplicate  the same period appears in more than one file; the one with the most figures is kept, the rest are
//              shown so nothing disappears without a word

import { ALL_FIELDS, type NumericField } from "../fields";
import { prepareFromForm, type StatementRow } from "../validate";
import { serialiseChecks } from "./annualChecks";
import { applyAutofillPeriod } from "./apply";
import { periodForEndDate } from "./periods";
import type { AutofillPeriod, AutofillResult } from "./types";
import type { CurrencyUnit } from "../units";
import type { Basis, PeriodType } from "../types";

export type ImportFile = { name: string; result: AutofillResult; unit: CurrencyUnit | null };

export type ExistingPeriod = {
  id?: string;
  period_type: string;
  period_label: string;
  period_end_date: string;
  basis: string;
  revenue_from_operations: number | null;
};

export type ImportStatus = "new" | "replace" | "blocked" | "duplicate";

export type ImportRow = {
  /** Where each figure came from, in the words the forms show; sent with the save so the source is kept. */
  sources: Record<string, string>;
  id: string;
  file: string;
  period_type: PeriodType | null;
  period_label: string | null;
  period_end_date: string | null;
  basis: Basis;
  figures: number;
  status: ImportStatus;
  selectedByDefault: boolean;
  /** Why it cannot be imported, or why it is shown but not kept. */
  errors: string[];
  warnings: string[];
  /** Everything worth knowing about this period, in full; this is what is saved with it. */
  notes: string[];
  /** Only what is specific to this period (the file-level notes are shown once, with the file). */
  periodNotes: string[];
  /** How many figures are derived or low confidence and worth a second look. */
  toVerify: number;
  /** The row to save, when status is new or replace. */
  statement: StatementRow | null;
};

type Workspace = { currency_unit: string | null | undefined; comparison_basis: Basis; fiscal_year_start_month: number };

const keyOf = (label: string, basis: string) => `${label}\u0000${basis}`;

export function planImport(files: ImportFile[], workspace: Workspace, existing: ExistingPeriod[]): ImportRow[] {
  const rows: ImportRow[] = [];

  files.forEach((file, fi) => {
    file.result.periods.forEach((p: AutofillPeriod, pi) => {
      const applied = applyAutofillPeriod(p, file.unit, workspace.currency_unit);
      const notes = [applied.unitNote, ...file.result.notes, ...p.notes].filter((n): n is string => !!n);
      // Where a figure was worked out rather than read, or read with low confidence, say so in the saved notes:
      // an import has no form to show the per-field captions in, so this is what a reviewer finds afterwards.
      const caveats = applied.verify.map((k) => {
        const f = p.fields[k as NumericField];
        const name = ALL_FIELDS.find((d) => d.key === k)?.label ?? k;
        return f?.derived ? `${name} was worked out (${f.derived}), not read.` : `${name} was read with low confidence from ${f?.source ?? "the file"}.`;
      });
      const figures = Object.keys(applied.values).length;
      const basis: Basis = p.basis ?? workspace.comparison_basis;
      const periodNotes = [...p.notes];
      if (!p.basis) {
        const note = `The file does not say whether this is standalone or consolidated; it is entered as ${basis}, this project's basis.`;
        notes.push(note);
        periodNotes.push(note);
      }

      let type: PeriodType | null = p.period_type;
      let label = p.period_label;
      let end = p.period_end_date;
      // A year column with an end date but no printed label is named the way the rest of Sentinel names years.
      // A column whose type is unknown is never guessed to be a year.
      if (end && type === "FY" && !label) label = periodForEndDate(end, "year", workspace.fiscal_year_start_month).period_label;

      const base = { id: `${fi}:${pi}`, sources: applied.sources, file: file.name, period_type: type, period_label: label, period_end_date: end, basis, figures, notes, periodNotes, toVerify: applied.verify.length };
      const blocked = (errors: string[]): ImportRow => ({ ...base, status: "blocked", selectedByDefault: false, errors, warnings: [], statement: null });

      if (figures === 0) return rows.push(blocked(["No figures were read for this column."]));
      if (!type || !label || !end) {
        const missing = [!type && "the period type", !label && "the period label", !end && "the period end date"].filter(Boolean).join(", ");
        return rows.push(blocked([`The file does not identify this period (missing ${missing}). Add it on the Add period page, where you can fill those in.`]));
      }

      const sameKey = existing.find((e) => e.period_label === label && e.basis === basis);
      if (sameKey && sameKey.period_type !== type) {
        return rows.push(blocked([`A ${basis} statement labelled "${label}" is already on file as ${sameKey.period_type}. Use a different label, or edit that one.`]));
      }
      const others = existing.filter((e) => e !== sameKey);
      const prepared = prepareFromForm(
        {
          periodType: type, periodLabel: label, periodEndDate: end, basis, values: applied.values, sourceFile: file.name, extractionNotes: ["Imported by rules (no AI).", ...notes, ...caveats].join(" ").slice(0, 4000),
          // What the auditor's report and the Key Audit Matters say belongs to the audited year, not to a quarter or a half-year column read from the same file.
          keyAuditMattersText: type === "FY" ? file.result.key_audit_matters_text : null,
          annualReportChecks: type === "FY" && file.result.annual_report_checks ? serialiseChecks(file.result.annual_report_checks) : null,
        },
        others
      );
      if (!prepared.row) return rows.push(blocked(prepared.errors));

      rows.push({
        ...base,
        status: sameKey ? "replace" : "new",
        selectedByDefault: !sameKey,
        errors: [],
        warnings: prepared.warnings,
        statement: prepared.row,
      });
    });
  });

  // The same period read from more than one file: keep the richest, show the rest.
  const groups = new Map<string, ImportRow[]>();
  for (const r of rows) {
    if (r.status === "blocked" || !r.period_label) continue;
    const k = keyOf(r.period_label, r.basis);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const keep = group.reduce((best, r) => (r.figures > best.figures ? r : best));
    for (const r of group) {
      if (r === keep) continue;
      r.status = "duplicate";
      r.selectedByDefault = false;
      r.statement = null;
      r.errors = [`${keep.file} also has ${r.period_label} and has more figures (${keep.figures} against ${r.figures}), so that one is used.`];
    }
  }

  return rows.sort((a, b) => (b.period_end_date ?? "").localeCompare(a.period_end_date ?? "") || a.file.localeCompare(b.file));
}

/** "3 new, 1 replacing, 2 cannot be imported" for the line above the table. */
export function summariseImport(rows: ImportRow[], selected: ReadonlySet<string>): string {
  const chosen = rows.filter((r) => selected.has(r.id) && r.statement);
  const add = chosen.filter((r) => r.status === "new").length;
  const replace = chosen.filter((r) => r.status === "replace").length;
  const skipped = rows.length - chosen.length;
  const parts = [`${add} new`, replace > 0 ? `${replace} replacing what is on file` : ""].filter(Boolean);
  return `${parts.join(", ")}${skipped > 0 ? `; ${skipped} not imported` : ""}`;
}
