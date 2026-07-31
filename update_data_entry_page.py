# save as update_data_entry_page.py, run: py update_data_entry_page.py
import pathlib

path = pathlib.Path("app/sentinel/data-entry/page.tsx")

content = '''"use client";

// Sentinel — manual data entry page. Talks to /api/sentinel/statement
// and /api/sentinel/extract. Gets the auth token from the browser's own
// Supabase session instead of asking anyone to hunt for it in DevTools.
// Handles two modes in one form: create a brand-new company (workspace +
// first period), or add a period to a company that already exists
// (paste its workspace_id, shown back to you after the first submit).
// PDF upload pre-fills fields via Document Intelligence — it never
// writes anything itself; you still review and hit Save period. Cash
// Flow fields are deliberately left out of this form for now — same as
// the rest of Sentinel, they're not collected anywhere yet.
//
// NOTE: assumes NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
// are already set (the rest of the site uses client-side Supabase auth,
// so these should already exist in your env). If your project uses
// different env var names for the anon key, swap them in below.

import { useState, type FormEvent, type ChangeEvent } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const SECTORS = [
  { value: "tyre", label: "Tyre Manufacturing" },
  { value: "fmcg", label: "FMCG / Consumer Staples" },
  { value: "general", label: "General / Other" },
];

const PERIOD_TYPES = ["Q1", "Q2", "Q3", "Q4", "FY"];

type Mode = "new" | "existing";

const NUM_FIELD = { width: "100%", padding: 8, fontSize: 14 };
const LABEL = { fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4, marginTop: 12 };
const SECTION = { marginTop: 24, paddingTop: 16, borderTop: "1px solid #ddd" };

function numOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

export default function DataEntryPage() {
  const [mode, setMode] = useState<Mode>("new");

  const [companyName, setCompanyName] = useState("");
  const [sector, setSector] = useState("fmcg");
  const [industry, setIndustry] = useState("");
  const [comparisonBasis, setComparisonBasis] = useState<"standalone" | "consolidated">("consolidated");

  const [existingWorkspaceId, setExistingWorkspaceId] = useState("");

  const [periodType, setPeriodType] = useState("FY");
  const [periodLabel, setPeriodLabel] = useState("");
  const [periodEndDate, setPeriodEndDate] = useState("");
  const [basis, setBasis] = useState<"standalone" | "consolidated">("consolidated");
  const [revenue, setRevenue] = useState("");
  const [pbt, setPbt] = useState("");
  const [pat, setPat] = useState("");

  const [otherIncome, setOtherIncome] = useState("");
  const [totalIncome, setTotalIncome] = useState("");
  const [totalExpenses, setTotalExpenses] = useState("");
  const [ebitda, setEbitda] = useState("");
  const [depreciation, setDepreciation] = useState("");
  const [financeCosts, setFinanceCosts] = useState("");
  const [exceptionalItems, setExceptionalItems] = useState("");
  const [taxExpense, setTaxExpense] = useState("");

  const [totalAssets, setTotalAssets] = useState("");
  const [currentAssets, setCurrentAssets] = useState("");
  const [cash, setCash] = useState("");
  const [tradeReceivables, setTradeReceivables] = useState("");
  const [inventory, setInventory] = useState("");
  const [fixedAssets, setFixedAssets] = useState("");
  const [totalLiabilities, setTotalLiabilities] = useState("");
  const [currentLiabilities, setCurrentLiabilities] = useState("");
  const [tradePayables, setTradePayables] = useState("");
  const [totalDebt, setTotalDebt] = useState("");
  const [totalEquity, setTotalEquity] = useState("");

  const [sourceFile, setSourceFile] = useState("");

  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [lastWorkspaceId, setLastWorkspaceId] = useState("");

  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [extractionNotes, setExtractionNotes] = useState("");
  const [lowConfidenceFields, setLowConfidenceFields] = useState<string[]>([]);

  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      setExtractError("Only PDF files are supported right now.");
      return;
    }

    setIsExtracting(true);
    setExtractError("");
    setExtractionNotes("");
    setLowConfidenceFields([]);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setIsExtracting(false);
      setExtractError("Not logged in — please log into Sentinel in this browser first, then retry.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/sentinel/extract", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        setExtractError(json.error ?? "Extraction failed.");
        setIsExtracting(false);
        return;
      }

      if (json.period_type) setPeriodType(json.period_type);
      if (json.period_label) setPeriodLabel(json.period_label);
      if (json.period_end_date) setPeriodEndDate(json.period_end_date);
      if (json.basis) setBasis(json.basis);
      if (json.source_file) setSourceFile(json.source_file);

      const f = json.fields ?? {};
      const asStr = (v: unknown) => (v === null || v === undefined ? "" : String(v));
      if ("revenue_from_operations" in f) setRevenue(asStr(f.revenue_from_operations));
      if ("other_income" in f) setOtherIncome(asStr(f.other_income));
      if ("total_income" in f) setTotalIncome(asStr(f.total_income));
      if ("total_expenses" in f) setTotalExpenses(asStr(f.total_expenses));
      if ("ebitda" in f) setEbitda(asStr(f.ebitda));
      if ("depreciation_amortisation" in f) setDepreciation(asStr(f.depreciation_amortisation));
      if ("finance_costs" in f) setFinanceCosts(asStr(f.finance_costs));
      if ("exceptional_items" in f) setExceptionalItems(asStr(f.exceptional_items));
      if ("profit_before_tax" in f) setPbt(asStr(f.profit_before_tax));
      if ("tax_expense" in f) setTaxExpense(asStr(f.tax_expense));
      if ("profit_after_tax" in f) setPat(asStr(f.profit_after_tax));
      if ("current_assets" in f) setCurrentAssets(asStr(f.current_assets));
      if ("current_liabilities" in f) setCurrentLiabilities(asStr(f.current_liabilities));
      if ("inventory" in f) setInventory(asStr(f.inventory));
      if ("trade_receivables" in f) setTradeReceivables(asStr(f.trade_receivables));
      if ("trade_payables" in f) setTradePayables(asStr(f.trade_payables));
      if ("total_debt" in f) setTotalDebt(asStr(f.total_debt));
      if ("total_equity" in f) setTotalEquity(asStr(f.total_equity));

      setExtractionNotes(json.extraction_notes ?? "");
      setLowConfidenceFields(json.low_confidence_fields ?? []);
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Extraction request failed.");
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setMessage("");

    if (mode === "new" && !companyName.trim()) {
      setStatus("error");
      setMessage("Company name is required for a new company.");
      return;
    }
    if (mode === "existing" && !existingWorkspaceId.trim()) {
      setStatus("error");
      setMessage("Paste the workspace_id from the first submission.");
      return;
    }
    if (!periodLabel.trim() || !periodEndDate || revenue.trim() === "" || pbt.trim() === "" || pat.trim() === "") {
      setStatus("error");
      setMessage("Period label, period end date, revenue, PBT, and PAT are all required.");
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setStatus("error");
      setMessage("Not logged in — please log into Sentinel in this browser first, then retry.");
      return;
    }

    const statement = {
      period_type: periodType,
      period_label: periodLabel.trim(),
      period_end_date: periodEndDate,
      basis,
      revenue_from_operations: Number(revenue),
      other_income: numOrNull(otherIncome),
      total_income: numOrNull(totalIncome),
      total_expenses: numOrNull(totalExpenses),
      ebitda: numOrNull(ebitda),
      depreciation_amortisation: numOrNull(depreciation),
      finance_costs: numOrNull(financeCosts),
      exceptional_items: numOrNull(exceptionalItems),
      profit_before_tax: Number(pbt),
      tax_expense: numOrNull(taxExpense),
      profit_after_tax: Number(pat),
      total_assets: numOrNull(totalAssets),
      current_assets: numOrNull(currentAssets),
      cash_and_equivalents: numOrNull(cash),
      trade_receivables: numOrNull(tradeReceivables),
      inventory: numOrNull(inventory),
      fixed_assets: numOrNull(fixedAssets),
      total_liabilities: numOrNull(totalLiabilities),
      current_liabilities: numOrNull(currentLiabilities),
      trade_payables: numOrNull(tradePayables),
      total_debt: numOrNull(totalDebt),
      total_equity: numOrNull(totalEquity),
      cash_from_operations: null,
      cash_from_investing: null,
      cash_from_financing: null,
      capex: null,
      source_file: sourceFile.trim() || "manual-entry",
      source_page: null,
      extraction_notes: extractionNotes.trim() || null,
    };

    const payload =
      mode === "new"
        ? {
            company_name: companyName.trim(),
            sector,
            industry: industry.trim() || null,
            comparison_basis: comparisonBasis,
            statement,
          }
        : {
            workspace_id: existingWorkspaceId.trim(),
            statement,
          };

    try {
      const res = await fetch("/api/sentinel/statement", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(json.error ?? "Something went wrong.");
        return;
      }
      setStatus("done");
      setLastWorkspaceId(json.workspace_id);
      setMessage(
        `Saved (${json.status}). Workspace ID: ${json.workspace_id} — copy this to add another period to the same company.`
      );
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Request failed.");
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Sentinel — Add Financial Data</h1>
      <p style={{ fontSize: 14, color: "#555" }}>
        Manual entry for testing. Create a new company, or add another period to one you already
        created here.
      </p>

      <div style={{ marginTop: 16 }}>
        <label style={{ marginRight: 16 }}>
          <input type="radio" checked={mode === "new"} onChange={() => setMode("new")} />{" "}
          New company
        </label>
        <label>
          <input type="radio" checked={mode === "existing"} onChange={() => setMode("existing")} />{" "}
          Add period to existing company
        </label>
      </div>

      <div style={SECTION}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Upload PDF to auto-fill (optional)</h2>
        <p style={{ fontSize: 13, color: "#555" }}>
          Text-based PDFs only — scanned/image-only filings aren't supported yet. This only fills
          in the fields below; nothing is saved until you review and click Save period.
        </p>
        <input type="file" accept="application/pdf" onChange={handleFileSelected} disabled={isExtracting} />
        {isExtracting && <p style={{ fontSize: 13, color: "#555" }}>Extracting…</p>}
        {extractError && <p style={{ fontSize: 13, color: "#b00" }}>{extractError}</p>}
        {extractionNotes && (
          <p style={{ fontSize: 13, color: "#555", marginTop: 8 }}>
            <strong>Extraction notes:</strong> {extractionNotes}
          </p>
        )}
        {lowConfidenceFields.length > 0 && (
          <p style={{ fontSize: 13, color: "#b60", marginTop: 4 }}>
            <strong>Double-check these before saving:</strong> {lowConfidenceFields.join(", ")}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        {mode === "new" ? (
          <div style={SECTION}>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>Company</h2>
            <label style={LABEL}>Company name *</label>
            <input style={NUM_FIELD} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Britannia Industries" />

            <label style={LABEL}>Sector *</label>
            <select style={NUM_FIELD} value={sector} onChange={(e) => setSector(e.target.value)}>
              {SECTORS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            <label style={LABEL}>Industry (optional)</label>
            <input style={NUM_FIELD} value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Food & Beverage" />

            <label style={LABEL}>Comparison basis *</label>
            <select
              style={NUM_FIELD}
              value={comparisonBasis}
              onChange={(e) => setComparisonBasis(e.target.value as "standalone" | "consolidated")}
            >
              <option value="consolidated">Consolidated</option>
              <option value="standalone">Standalone</option>
            </select>
          </div>
        ) : (
          <div style={SECTION}>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>Existing company</h2>
            <label style={LABEL}>Workspace ID *</label>
            <input
              style={NUM_FIELD}
              value={existingWorkspaceId}
              onChange={(e) => setExistingWorkspaceId(e.target.value)}
              placeholder="paste the workspace_id returned after your first submission"
            />
          </div>
        )}

        <div style={SECTION}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Period</h2>
          <label style={LABEL}>Period type *</label>
          <select style={NUM_FIELD} value={periodType} onChange={(e) => setPeriodType(e.target.value)}>
            {PERIOD_TYPES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <label style={LABEL}>Period label * (e.g. FY25)</label>
          <input style={NUM_FIELD} value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} />

          <label style={LABEL}>Period end date * (YYYY-MM-DD)</label>
          <input type="date" style={NUM_FIELD} value={periodEndDate} onChange={(e) => setPeriodEndDate(e.target.value)} />

          <label style={LABEL}>Basis (this statement) *</label>
          <select style={NUM_FIELD} value={basis} onChange={(e) => setBasis(e.target.value as "standalone" | "consolidated")}>
            <option value="consolidated">Consolidated</option>
            <option value="standalone">Standalone</option>
          </select>
        </div>

        <div style={SECTION}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Income Statement (₹ crore)</h2>
          <label style={LABEL}>Revenue from operations *</label>
          <input style={NUM_FIELD} value={revenue} onChange={(e) => setRevenue(e.target.value)} />
          <label style={LABEL}>Profit before tax *</label>
          <input style={NUM_FIELD} value={pbt} onChange={(e) => setPbt(e.target.value)} />
          <label style={LABEL}>Profit after tax *</label>
          <input style={NUM_FIELD} value={pat} onChange={(e) => setPat(e.target.value)} />

          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              More Income Statement fields (optional)
            </summary>
            <label style={LABEL}>Other income</label>
            <input style={NUM_FIELD} value={otherIncome} onChange={(e) => setOtherIncome(e.target.value)} />
            <label style={LABEL}>Total income</label>
            <input style={NUM_FIELD} value={totalIncome} onChange={(e) => setTotalIncome(e.target.value)} />
            <label style={LABEL}>Total expenses</label>
            <input style={NUM_FIELD} value={totalExpenses} onChange={(e) => setTotalExpenses(e.target.value)} />
            <label style={LABEL}>EBITDA</label>
            <input style={NUM_FIELD} value={ebitda} onChange={(e) => setEbitda(e.target.value)} />
            <label style={LABEL}>Depreciation & amortisation</label>
            <input style={NUM_FIELD} value={depreciation} onChange={(e) => setDepreciation(e.target.value)} />
            <label style={LABEL}>Finance costs</label>
            <input style={NUM_FIELD} value={financeCosts} onChange={(e) => setFinanceCosts(e.target.value)} />
            <label style={LABEL}>Exceptional items</label>
            <input style={NUM_FIELD} value={exceptionalItems} onChange={(e) => setExceptionalItems(e.target.value)} />
            <label style={LABEL}>Tax expense</label>
            <input style={NUM_FIELD} value={taxExpense} onChange={(e) => setTaxExpense(e.target.value)} />
          </details>
        </div>

        <div style={SECTION}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Balance Sheet (₹ crore, optional but recommended)</h2>
          <label style={LABEL}>Total assets</label>
          <input style={NUM_FIELD} value={totalAssets} onChange={(e) => setTotalAssets(e.target.value)} />
          <label style={LABEL}>Current assets</label>
          <input style={NUM_FIELD} value={currentAssets} onChange={(e) => setCurrentAssets(e.target.value)} />
          <label style={LABEL}>Cash & equivalents</label>
          <input style={NUM_FIELD} value={cash} onChange={(e) => setCash(e.target.value)} />
          <label style={LABEL}>Trade receivables</label>
          <input style={NUM_FIELD} value={tradeReceivables} onChange={(e) => setTradeReceivables(e.target.value)} />
          <label style={LABEL}>Inventory</label>
          <input style={NUM_FIELD} value={inventory} onChange={(e) => setInventory(e.target.value)} />
          <label style={LABEL}>Fixed assets</label>
          <input style={NUM_FIELD} value={fixedAssets} onChange={(e) => setFixedAssets(e.target.value)} />
          <label style={LABEL}>Total liabilities</label>
          <input style={NUM_FIELD} value={totalLiabilities} onChange={(e) => setTotalLiabilities(e.target.value)} />
          <label style={LABEL}>Current liabilities</label>
          <input style={NUM_FIELD} value={currentLiabilities} onChange={(e) => setCurrentLiabilities(e.target.value)} />
          <label style={LABEL}>Trade payables</label>
          <input style={NUM_FIELD} value={tradePayables} onChange={(e) => setTradePayables(e.target.value)} />
          <label style={LABEL}>Total debt</label>
          <input style={NUM_FIELD} value={totalDebt} onChange={(e) => setTotalDebt(e.target.value)} />
          <label style={LABEL}>Total equity</label>
          <input style={NUM_FIELD} value={totalEquity} onChange={(e) => setTotalEquity(e.target.value)} />
        </div>

        <div style={SECTION}>
          <label style={LABEL}>Source (optional, e.g. "britannia-fy25-annual-report")</label>
          <input style={NUM_FIELD} value={sourceFile} onChange={(e) => setSourceFile(e.target.value)} />
        </div>

        <button
          type="submit"
          disabled={status === "submitting"}
          style={{
            marginTop: 24,
            padding: "10px 20px",
            fontSize: 14,
            fontWeight: 600,
            cursor: status === "submitting" ? "default" : "pointer",
          }}
        >
          {status === "submitting" ? "Saving..." : "Save period"}
        </button>

        {message && (
          <p style={{ marginTop: 16, color: status === "error" ? "#b00" : "#080", fontSize: 14 }}>
            {message}
          </p>
        )}
        {lastWorkspaceId && status === "done" && mode === "new" && (
          <p style={{ fontSize: 13, color: "#555" }}>
            Switch to "Add period to existing company" and paste this workspace_id to add the next
            year.
          </p>
        )}
      </form>
    </div>
  );
}
'''

path.write_text(content, encoding="utf-8")
print(f"OK — wrote {len(content.encode('utf-8'))} bytes to {path}")