# -*- coding: utf-8 -*-
"""
Sentinel - Cash Flow: unlocks the Health Engine's Cash Flow category
(OCF vs. PAT cash-conversion check) and wires all three collection
paths - New Project, Manage Periods, and Document Intelligence
extraction - so the 4 cash_from_operations/cash_from_investing/
cash_from_financing/capex columns (confirmed already present on
sentinel_statements) actually get populated. Touches:
  app/sentinel/lib/health.ts
  app/sentinel/new-project/page.tsx
  app/sentinel/add-period/page.tsx
  app/api/sentinel/extract/route.ts
Run from the repo root (the folder containing package.json).
"""
import io
import os
import sys

ROOT = os.getcwd()

def read(path):
    with io.open(path, "r", encoding="utf-8") as f:
        return f.read()

def write(path, content):
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)

def brace_check(path, content):
    opens = content.count("{")
    closes = content.count("}")
    if opens == closes:
        print("[OK] brace check " + path + ": " + str(opens) + " open / " + str(closes) + " close")
    else:
        print("[MISS] brace mismatch in " + path + ": " + str(opens) + " open / " + str(closes) + " close")

def apply_edit(content, old, new, label, get_content_path):
    count = content.count(old)
    if count == 0:
        print("[MISS] " + label + ": anchor not found. Run: Get-Content \"" + get_content_path + "\" and paste it back.")
        return None
    if count > 1:
        print("[MISS] " + label + ": anchor found " + str(count) + " times, expected 1. Run: Get-Content \"" + get_content_path + "\" and paste it back.")
        return None
    print("[OK] " + label)
    return content.replace(old, new, 1)

if not os.path.exists(os.path.join(ROOT, "package.json")):
    print("[MISS] not running from repo root - cd to the folder with package.json and rerun")
    sys.exit(1)
print("[OK] running from repo root")

# =======================================================================
# FILE 1 of 4: app/sentinel/lib/health.ts
# =======================================================================
print("")
print("--- health.ts ---")
health_path = os.path.join(ROOT, "app", "sentinel", "lib", "health.ts")
health_current = read(health_path)
health_get_content = health_path

h_edit1_old = '''const pct = (v: number) => `${(v * 100).toFixed(1)}%`;'''
h_edit1_new = '''const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const inr = (v: number) =>
  `\\u20b9${v.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} cr`;'''
health2 = apply_edit(health_current, h_edit1_old, h_edit1_new, "add inr() formatter", health_get_content)

h_edit2_old = '''  categories.push({
    key: "cash_flow", label: "Cash Flow", status: "no_data",
    metric_label: null, value: null,
    detail: "Cash Flow statement not yet extracted for this company",
  });'''
h_edit2_new = '''  // Cash Flow - operating cash flow vs. PAT (cash conversion of
  // reported profit), a standard first-pass earnings-quality check:
  // cash consistently falling well short of profit is a common red
  // flag (aggressive revenue recognition, working capital
  // deterioration). No existing anomaly.ts threshold to borrow here
  // (nothing in config.ts covers cash flow), so OCF_TO_PAT_MIN below
  // is a new, unvalidated starting assumption, flagged the same way
  // Profitability's own 2-percentage-point reference already is -
  // worth calibrating against real filings later, not treated as
  // authoritative. When PAT is zero or negative the ratio itself
  // isn't meaningful (dividing by a non-positive number), so that
  // case falls back to whether operating cash flow itself is
  // positive or negative, mirroring how Profitability already falls
  // back to a sign-based check when there is no prior period to
  // compare against.
  {
    const ocf = stmt.cash_from_operations;
    const pat = stmt.profit_after_tax;
    if (ocf == null) {
      categories.push({
        key: "cash_flow", label: "Cash Flow", status: "no_data",
        metric_label: null, value: null, detail: null,
      });
    } else if (pat <= 0) {
      const status = ocf > 0 ? "watch" : "critical";
      categories.push({
        key: "cash_flow", label: "Cash Flow", status,
        metric_label: "Operating cash flow", value: ocf,
        detail: `Operating cash flow of ${inr(ocf)} against a non-positive PAT of ${inr(pat)} - cash conversion ratio is not meaningful here`,
      });
    } else {
      const OCF_TO_PAT_MIN = 0.7;
      const ratio = ocf / pat;
      const severity = OCF_TO_PAT_MIN / Math.max(ratio, 0.01);
      categories.push({
        key: "cash_flow", label: "Cash Flow", status: bandFromSeverity(severity),
        metric_label: "OCF / PAT", value: ratio,
        detail: `Operating cash flow of ${inr(ocf)} is ${(ratio * 100).toFixed(0)}% of PAT (${inr(pat)}), vs. the ${(OCF_TO_PAT_MIN * 100).toFixed(0)}% reference`,
      });
    }
  }'''
health3 = None
if health2 is not None:
    health3 = apply_edit(health2, h_edit2_old, h_edit2_new, "unlock Cash Flow category", health_get_content)

if health3 is not None:
    write(health_path, health3)
    print("[OK] wrote " + health_path)
    brace_check(health_path, health3)
else:
    print("[MISS] health.ts NOT written - at least one edit failed above. No partial write performed.")

# =======================================================================
# FILE 2 of 4: app/sentinel/new-project/page.tsx
# =======================================================================
print("")
print("--- new-project/page.tsx ---")
np_path = os.path.join(ROOT, "app", "sentinel", "new-project", "page.tsx")
np_current = read(np_path)
np_get_content = np_path

np_edit1_old = '''const BALANCE_SHEET_FIELDS: {
  key: string;
  label: string;
}[] = [
  { key: "current_assets", label: "Current Assets" },
  { key: "current_liabilities", label: "Current Liabilities" },
  { key: "inventory", label: "Inventory" },
  { key: "trade_receivables", label: "Trade Receivables" },
  { key: "trade_payables", label: "Trade Payables" },
  { key: "total_debt", label: "Total Debt" },
  { key: "total_equity", label: "Total Equity" },
];'''
np_edit1_new = '''const BALANCE_SHEET_FIELDS: {
  key: string;
  label: string;
}[] = [
  { key: "current_assets", label: "Current Assets" },
  { key: "current_liabilities", label: "Current Liabilities" },
  { key: "inventory", label: "Inventory" },
  { key: "trade_receivables", label: "Trade Receivables" },
  { key: "trade_payables", label: "Trade Payables" },
  { key: "total_debt", label: "Total Debt" },
  { key: "total_equity", label: "Total Equity" },
];

// Cash Flow fields - optional, feed the Health Engine's Cash Flow
// category (operating cash flow vs. PAT). capex is captured even
// though the current Cash Flow health check doesn't use it yet, since
// it's part of the same statement section and cheap to collect now
// rather than needing a second pass through this filing later.
const CASH_FLOW_FIELDS: {
  key: string;
  label: string;
}[] = [
  { key: "cash_from_operations", label: "Cash from Operations" },
  { key: "cash_from_investing", label: "Cash from Investing" },
  { key: "cash_from_financing", label: "Cash from Financing" },
  { key: "capex", label: "Capital Expenditure" },
];'''
np2 = apply_edit(np_current, np_edit1_old, np_edit1_new, "add CASH_FLOW_FIELDS array", np_get_content)

np_edit2_old = '''    for (const f of BALANCE_SHEET_FIELDS) {
      const raw = values[f.key];
      record[f.key] = raw != null && raw !== "" ? parseFloat(raw) : null;
    }
    const { error: insertError } = await supabase.from("sentinel_statements").insert(record);'''
np_edit2_new = '''    for (const f of BALANCE_SHEET_FIELDS) {
      const raw = values[f.key];
      record[f.key] = raw != null && raw !== "" ? parseFloat(raw) : null;
    }
    for (const f of CASH_FLOW_FIELDS) {
      const raw = values[f.key];
      record[f.key] = raw != null && raw !== "" ? parseFloat(raw) : null;
    }
    const { error: insertError } = await supabase.from("sentinel_statements").insert(record);'''
np3 = None
if np2 is not None:
    np3 = apply_edit(np2, np_edit2_old, np_edit2_new, "wire cash flow fields into insert record", np_get_content)

np_edit3_old = '''          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.2rem" }}>
            {BALANCE_SHEET_FIELDS.map((f) => {
              const isLowConfidence = lowConfidenceFields.includes(f.key);
              return (
                <Field
                  key={f.key}
                  label={f.label + (isLowConfidence ? " (verify)" : "")}
                >
                  <input
                    type="number"
                    step="0.01"
                    style={{ ...inputStyle, borderColor: isLowConfidence ? T.accent : T.rule }}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder="0.00"
                  />
                </Field>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button style={btnPrimary} onClick={createStatement} disabled={saving}>'''
np_edit3_new = '''          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.2rem" }}>
            {BALANCE_SHEET_FIELDS.map((f) => {
              const isLowConfidence = lowConfidenceFields.includes(f.key);
              return (
                <Field
                  key={f.key}
                  label={f.label + (isLowConfidence ? " (verify)" : "")}
                >
                  <input
                    type="number"
                    step="0.01"
                    style={{ ...inputStyle, borderColor: isLowConfidence ? T.accent : T.rule }}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder="0.00"
                  />
                </Field>
              );
            })}
          </div>

          <div style={{ height: 1, background: T.rule, margin: "0.4rem 0 1.2rem 0" }} />

          <p
            style={{
              fontSize: "0.7rem",
              fontWeight: 500,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: T.inkSoft,
              margin: "0 0 0.8rem 0",
            }}
          >
            Cash Flow (optional) - unlocks the Business Health Cash Flow category
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.2rem" }}>
            {CASH_FLOW_FIELDS.map((f) => {
              const isLowConfidence = lowConfidenceFields.includes(f.key);
              return (
                <Field
                  key={f.key}
                  label={f.label + (isLowConfidence ? " (verify)" : "")}
                >
                  <input
                    type="number"
                    step="0.01"
                    style={{ ...inputStyle, borderColor: isLowConfidence ? T.accent : T.rule }}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder="0.00"
                  />
                </Field>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button style={btnPrimary} onClick={createStatement} disabled={saving}>'''
np4 = None
if np3 is not None:
    np4 = apply_edit(np3, np_edit3_old, np_edit3_new, "render Cash Flow section", np_get_content)

if np4 is not None:
    write(np_path, np4)
    print("[OK] wrote " + np_path)
    brace_check(np_path, np4)
else:
    print("[MISS] new-project/page.tsx NOT written - at least one edit failed above. No partial write performed.")

# =======================================================================
# FILE 3 of 4: app/sentinel/add-period/page.tsx
# =======================================================================
print("")
print("--- add-period/page.tsx ---")
ap_path = os.path.join(ROOT, "app", "sentinel", "add-period", "page.tsx")
ap_current = read(ap_path)
ap_get_content = ap_path

ap_edit1_old = '''const BALANCE_SHEET_FIELDS: {
  key: string;
  label: string;
}[] = [
  { key: "current_assets", label: "Current Assets" },
  { key: "current_liabilities", label: "Current Liabilities" },
  { key: "inventory", label: "Inventory" },
  { key: "trade_receivables", label: "Trade Receivables" },
  { key: "trade_payables", label: "Trade Payables" },
  { key: "total_debt", label: "Total Debt" },
  { key: "total_equity", label: "Total Equity" },
];

const ALL_FIELD_KEYS = [...STATEMENT_FIELDS, ...BALANCE_SHEET_FIELDS].map((f) => f.key);'''
ap_edit1_new = '''const BALANCE_SHEET_FIELDS: {
  key: string;
  label: string;
}[] = [
  { key: "current_assets", label: "Current Assets" },
  { key: "current_liabilities", label: "Current Liabilities" },
  { key: "inventory", label: "Inventory" },
  { key: "trade_receivables", label: "Trade Receivables" },
  { key: "trade_payables", label: "Trade Payables" },
  { key: "total_debt", label: "Total Debt" },
  { key: "total_equity", label: "Total Equity" },
];

// Cash Flow fields - optional, feed the Health Engine's Cash Flow
// category (operating cash flow vs. PAT). capex is captured even
// though the current Cash Flow health check doesn't use it yet, since
// it's part of the same statement section and cheap to collect now
// rather than needing a second pass through this filing later.
const CASH_FLOW_FIELDS: {
  key: string;
  label: string;
}[] = [
  { key: "cash_from_operations", label: "Cash from Operations" },
  { key: "cash_from_investing", label: "Cash from Investing" },
  { key: "cash_from_financing", label: "Cash from Financing" },
  { key: "capex", label: "Capital Expenditure" },
];

const ALL_FIELD_KEYS = [...STATEMENT_FIELDS, ...BALANCE_SHEET_FIELDS, ...CASH_FLOW_FIELDS].map((f) => f.key);'''
ap2 = apply_edit(ap_current, ap_edit1_old, ap_edit1_new, "add CASH_FLOW_FIELDS array + extend ALL_FIELD_KEYS", ap_get_content)

ap_edit2_old = '''    for (const f of BALANCE_SHEET_FIELDS) {
      const raw = values[f.key];
      record[f.key] = raw != null && raw !== "" ? parseFloat(raw) : null;
    }

    if (selectedStatementId === "new") {'''
ap_edit2_new = '''    for (const f of BALANCE_SHEET_FIELDS) {
      const raw = values[f.key];
      record[f.key] = raw != null && raw !== "" ? parseFloat(raw) : null;
    }
    for (const f of CASH_FLOW_FIELDS) {
      const raw = values[f.key];
      record[f.key] = raw != null && raw !== "" ? parseFloat(raw) : null;
    }

    if (selectedStatementId === "new") {'''
ap3 = None
if ap2 is not None:
    ap3 = apply_edit(ap2, ap_edit2_old, ap_edit2_new, "wire cash flow fields into insert/update record", ap_get_content)

ap_edit3_old = '''          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.2rem" }}>
            {BALANCE_SHEET_FIELDS.map((f) => {
              const isLowConfidence = lowConfidenceFields.includes(f.key);
              return (
                <Field
                  key={f.key}
                  label={f.label + (isLowConfidence ? " (verify)" : "")}
                >
                  <input
                    type="number"
                    step="0.01"
                    style={{ ...inputStyle, borderColor: isLowConfidence ? T.accent : T.rule }}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder="0.00"
                  />
                </Field>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
            <button style={btnPrimary} onClick={saveStatement} disabled={saving}>'''
ap_edit3_new = '''          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.2rem" }}>
            {BALANCE_SHEET_FIELDS.map((f) => {
              const isLowConfidence = lowConfidenceFields.includes(f.key);
              return (
                <Field
                  key={f.key}
                  label={f.label + (isLowConfidence ? " (verify)" : "")}
                >
                  <input
                    type="number"
                    step="0.01"
                    style={{ ...inputStyle, borderColor: isLowConfidence ? T.accent : T.rule }}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder="0.00"
                  />
                </Field>
              );
            })}
          </div>

          <div style={{ height: 1, background: T.rule, margin: "0.4rem 0 1.2rem 0" }} />

          <p
            style={{
              fontSize: "0.7rem",
              fontWeight: 500,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: T.inkSoft,
              margin: "0 0 0.8rem 0",
            }}
          >
            Cash Flow (optional) - unlocks the Business Health Cash Flow category
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.2rem" }}>
            {CASH_FLOW_FIELDS.map((f) => {
              const isLowConfidence = lowConfidenceFields.includes(f.key);
              return (
                <Field
                  key={f.key}
                  label={f.label + (isLowConfidence ? " (verify)" : "")}
                >
                  <input
                    type="number"
                    step="0.01"
                    style={{ ...inputStyle, borderColor: isLowConfidence ? T.accent : T.rule }}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder="0.00"
                  />
                </Field>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap": "wrap" }}>
            <button style={btnPrimary} onClick={saveStatement} disabled={saving}>'''
ap4 = None
if ap3 is not None:
    ap4 = apply_edit(ap3, ap_edit3_old, ap_edit3_new, "render Cash Flow section", ap_get_content)

if ap4 is not None:
    write(ap_path, ap4)
    print("[OK] wrote " + ap_path)
    brace_check(ap_path, ap4)
else:
    print("[MISS] add-period/page.tsx NOT written - at least one edit failed above. No partial write performed.")

# =======================================================================
# FILE 4 of 4: app/api/sentinel/extract/route.ts
# =======================================================================
print("")
print("--- extract/route.ts ---")
ex_path = os.path.join(ROOT, "app", "api", "sentinel", "extract", "route.ts")
ex_current = read(ex_path)
ex_get_content = ex_path

ex_edit1_old = '''// Matches STATEMENT_FIELDS in new-project/page.tsx exactly. Balance
// sheet fields feed the liquidity/leverage/working-capital checks.
const FIELD_LIST = [
  "revenue_from_operations",
  "other_income",
  "total_income",
  "total_expenses",
  "ebitda",
  "depreciation_amortisation",
  "finance_costs",
  "exceptional_items",
  "profit_before_tax",
  "tax_expense",
  "profit_after_tax",
  "current_assets",
  "current_liabilities",
  "inventory",
  "trade_receivables",
  "trade_payables",
  "total_debt",  "total_equity",
];'''
ex_edit1_new = '''// Matches STATEMENT_FIELDS in new-project/page.tsx exactly. Balance
// sheet fields feed the liquidity/leverage/working-capital checks; cash
// flow fields feed the Health Engine's Cash Flow category.
const FIELD_LIST = [
  "revenue_from_operations",
  "other_income",
  "total_income",
  "total_expenses",
  "ebitda",
  "depreciation_amortisation",
  "finance_costs",
  "exceptional_items",
  "profit_before_tax",
  "tax_expense",
  "profit_after_tax",
  "current_assets",
  "current_liabilities",
  "inventory",
  "trade_receivables",
  "trade_payables",
  "total_debt",
  "total_equity",
  "cash_from_operations",
  "cash_from_investing",
  "cash_from_financing",
  "capex",
];'''
ex2 = apply_edit(ex_current, ex_edit1_old, ex_edit1_new, "add cash flow fields to FIELD_LIST", ex_get_content)

if ex2 is not None:
    write(ex_path, ex2)
    print("[OK] wrote " + ex_path)
    brace_check(ex_path, ex2)
else:
    print("[MISS] extract/route.ts NOT written - anchor failed above. No partial write performed.")

print("")
print("=== Summary ===")
print("Then:  npm run build")
print("Then:  git status  /  git diff --stat")
