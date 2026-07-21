// Sentinel — core types. Field names match the sentinel_statements /
// sentinel_reviews Supabase tables exactly (snake_case), so rows come off
// supabase-js and go straight into the engine with zero mapping.

export type PeriodType = "Q1" | "Q2" | "Q3" | "Q4" | "FY";
export type Basis = "standalone" | "consolidated";

export type FinancialStatement = {
  id?: string;
  owner_id?: string | null; // null = public demo dataset row
  company_id: string;
  company_name: string;
  ticker: string | null;
  period_type: PeriodType;
  period_label: string;
  period_end_date: string; // "YYYY-MM-DD"
  basis: Basis;
  currency_unit: string;
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
  source_file: string;
  source_page: string | null;
  extraction_notes: string | null;
};

export type AnomalyFlag = {
  company_id: string;
  company_name: string;
  period_label: string;
  flag_type: "yoy_swing" | "peer_outlier" | "exceptional_item";
  metric: string;
  value: number;
  threshold: number;
  description: string;
};

export type PeerRow = {
  company_id: string;
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

export type ReviewStatus = "pending" | "approved" | "edited" | "rejected";

export type SentinelReview = {
  id: string;
  owner_id: string;
  company_id: string;
  company_name: string;
  status: ReviewStatus;
  flags: AnomalyFlag[];
  initial_hypothesis: string | null;
  ai_narrative: string | null;
  final_narrative: string | null;
  reviewer_notes: string | null;
  created_at: string;
  updated_at: string;
};
