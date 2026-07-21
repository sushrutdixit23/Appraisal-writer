// Sentinel — core types. Rebuilt around Company Workspace as the
// foundation: a company IS a workspace, there's no separate identity.
// "is_subject" is no longer a static property anywhere in these types —
// it's assigned at query time based on which workspace you're viewing
// from (see buildPeerTable in engine.ts). Field names match the Supabase
// table columns exactly (snake_case), so rows come off supabase-js and
// go straight into the engine with zero mapping.

export type PeriodType = "Q1" | "Q2" | "Q3" | "Q4" | "FY";
export type Basis = "standalone" | "consolidated";

export type Workspace = {
  id: string;
  owner_id: string | null; // null = public reference workspace
  company_name: string;
  sector: string;
  industry: string | null;
  is_public_reference: boolean;
  fiscal_year_start_month: number;
  currency: string;
  currency_unit: string;
  comparison_basis: Basis;
};

export type WorkspaceRole = "owner" | "analyst" | "viewer";

export type WorkspaceMember = {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
};

export type FinancialStatement = {
  id?: string;
  workspace_id: string;
  period_type: PeriodType;
  period_label: string;
  period_end_date: string; // "YYYY-MM-DD"
  basis: Basis;

  // Income Statement — populated for all 14 demo filings today
  revenue_from_operations: number;
  other_income: number | null;
  total_income: number | null;
  total_expenses: number | null;
  ebitda: number | null;
  depreciation_amortisation: number | null;
  finance_costs: number | null;
  exceptional_items: number | null;
  profit_before_tax: number;
  tax_expense: number | null;
  profit_after_tax: number;

  // Balance Sheet — nullable, not yet extracted for the demo set
  total_assets: number | null;
  current_assets: number | null;
  cash_and_equivalents: number | null;
  trade_receivables: number | null;
  inventory: number | null;
  fixed_assets: number | null;
  total_liabilities: number | null;
  current_liabilities: number | null;
  trade_payables: number | null;
  total_debt: number | null;
  total_equity: number | null;

  // Cash Flow — nullable, not yet extracted for the demo set
  cash_from_operations: number | null;
  cash_from_investing: number | null;
  cash_from_financing: number | null;
  capex: number | null;

  source_file: string;
  source_page: string | null;
  extraction_notes: string | null;
};

export type AnomalyFlag = {
  workspace_id: string;
  company_name: string;
  period_label: string;
  flag_type: "yoy_swing" | "peer_outlier" | "exceptional_item";
  metric: string;
  value: number;
  threshold: number;
  severity: number; // multiples past threshold, comparable across flag types (e.g. 1.6 = 60% past the line)
  description: string;
};

export type PeerRow = {
  workspace_id: string;
  company_name: string;
  is_subject: boolean;
  period_label: string;
  basis: Basis;
  basis_caveat: string | null;
  revenue_cr: number;
  pat_cr: number;
  pbt_cr: number;
  exceptional_items_cr: number;
  has_prior_year: boolean;
  ratios: Record<string, number | null>;
};

export type InvestigationStatus =
  | "pending"
  | "approved"
  | "edited"
  | "rejected"
  | "archived";

// The full chain from the vision doc: Observation -> Evidence ->
// AI Analysis -> Confidence -> Suggested Questions -> Suggested Actions
// -> Approve -> Archive. `observation` reuses AnomalyFlag as the Evidence
// shape — the flags ARE the evidence. confidence_score is always a
// computed statistic (see anomaly.ts computeConfidence), never an
// LLM-stated number.
export type Investigation = {
  id: string;
  workspace_id: string;
  owner_id: string;
  statement_id: string | null;
  period_label: string;
  status: InvestigationStatus;
  observation: AnomalyFlag[];
  initial_hypothesis: string | null;
  ai_narrative: string | null;
  confidence_score: number | null;
  confidence_signals: Record<string, unknown>;
  suggested_questions: string[];
  suggested_actions: string[];
  final_narrative: string | null;
  reviewer_notes: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};
