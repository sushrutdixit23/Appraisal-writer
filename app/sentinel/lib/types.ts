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
  // Market data for peer valuation (EV/EBITDA, P/E, EV/Sales, market cap). A person's own manual entry, not a
  // live feed - Sentinel has none - so it is kept apart from everything the filing itself reports, with its
  // own "as of" date so a stale price is visible rather than silently assumed current. Optional in the type
  // (and in the database until supabase/migrations/20261101000000_sentinel_market_data.sql is applied).
  market_price?: number | null;
  market_price_as_of?: string | null;
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
  review_cycle_id: string | null;
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

  // Balance Sheet — nullable. Not yet collected by New Project/Add
  // Period forms or Document Intelligence extraction as of this type
  // definition - that's the next build step. Liquidity/leverage/working
  // capital checks in anomaly.ts read these via computed ratios and
  // simply skip (return null, no flag) wherever a company hasn't
  // supplied them yet - same null-safe pattern the Income Statement
  // ratios already use.
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
  // Optional lines for the Altman Z'' and Beneish M scores. Optional in the type (and in the database until
  // supabase/migrations/20261029000000_sentinel_score_fields.sql is applied), so a row without them is still valid.
  retained_earnings?: number | null;
  cost_of_goods_sold?: number | null;
  sga_expense?: number | null;
  // Optional lines added for the Piotroski F-Score, peer valuation and the unbilled-revenue check - same
  // "not yet in the database until its migration is applied" rule as the three fields just above.
  // Shares outstanding: the no-dilution criterion in the Piotroski F-Score, and the share count a market
  // price is divided by for market cap, P/E and EV multiples.
  shares_outstanding?: number | null;
  // Unbilled revenue (often printed with trade receivables as "trade receivables and unbilled revenue" in the
  // cash flow note): tracked on its own so its growth can be compared with revenue's - growing materially
  // faster than revenue, for an IT-services company especially, is a real, specific revenue-recognition
  // red flag, not a generic one.
  unbilled_revenue?: number | null;

  // Cash Flow — nullable, not yet extracted for the demo set
  cash_from_operations: number | null;
  cash_from_investing: number | null;
  cash_from_financing: number | null;
  capex: number | null;

  source_file: string;
  source_page: string | null;
  extraction_notes: string | null;
  // The auditor's own Key Audit Matters paragraph(s), verbatim, captured at extraction time -
  // real red flags often show up here before they ever become a number (see extraction.ts
  // extractKeyAuditMattersText). Optional in the type (and in the database until
  // supabase/migrations/20261102000000_sentinel_kam_text.sql is applied), same rule as the other
  // fields added after the first release.
  key_audit_matters_text?: string | null;
};

export type AnomalyFlag = {
  workspace_id: string;
  company_name: string;
  period_label: string;
  flag_type:
    | "yoy_swing"
    | "peer_outlier"
    | "exceptional_item"
    | "liquidity"
    | "leverage"
    | "working_capital"
    | "revenue_recognition";
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
  // Absolute figures are in CRORE whatever unit the company reports in
  // (buildPeerTable converts), so rows from different companies compare.
  revenue_cr: number;
  pat_cr: number;
  pbt_cr: number;
  exceptional_items_cr: number;
  // The prior-year figures behind the YoY ratios, in crore. null when
  // there is no like-for-like prior year on file.
  prior_revenue_cr: number | null;
  prior_pat_cr: number | null;
  total_equity_cr: number | null;
  // Unbilled revenue, in crore, and the prior year's - null whenever either year doesn't have the line.
  // Kept apart from the other absolute figures above (added for one specific check, not general display).
  unbilled_revenue_cr: number | null;
  prior_unbilled_revenue_cr: number | null;
  has_prior_year: boolean;
  ratios: Record<string, number | null>;
};

export type InvestigationStatus =
  | "pending"
  | "approved"
  | "edited"
  | "rejected"
  | "archived";

// The full chain from the vision doc: Observation -> Evidence -> AI
// Analysis -> Confidence -> Suggested Questions -> Suggested Actions ->
// Approve -> Archive. `observation` reuses AnomalyFlag as the Evidence
// shape — the flags ARE the evidence. confidence_score is always a
// computed statistic (see anomaly.ts computeConfidence), never an
// LLM-stated number.
export type Investigation = {
  id: string;
  workspace_id: string;
  review_cycle_id: string | null;
  owner_id: string;
  statement_id: string | null;
  period_label: string;
  status: InvestigationStatus;
  observation: AnomalyFlag[];
  initial_hypothesis: string | null;
  ai_narrative: string | null;
  // Investigation Engine V2 - three roadmap chain steps that were being
  // computed/reasoned about but not persisted before. named_peer is
  // deterministic (findClosestPeer, already computed for the prompt);
  // possible_causes and financial_impact are extracted via the existing
  // non-fatal turn-3 JSON call alongside suggested_questions/actions -
  // all three null on investigations generated before this was added.
  named_peer: string | null;
  possible_causes: string[];
  financial_impact: string | null;
  confidence_score: number | null;
  confidence_signals: Record<string, unknown>;
  suggested_questions: string[];
  suggested_actions: string[];
  final_narrative: string | null;
  reviewer_notes: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  // Rupee/percentage figures the AI narrative stated that checkNarrativeGrounding (see
  // narrativeGrounding.ts) could not trace to the data the model was actually given, computed
  // deterministically, never asked of Claude - same rule as confidence_score. An empty array
  // means every figure checked out; optional in the type (and in the database until
  // supabase/migrations/20261103000000_sentinel_grounding_warnings.sql is applied), so an older
  // investigation generated before this check existed simply has none to show.
  grounding_warnings?: string[];
};

// Review Cycle — Phase 1's core object (see roadmap). Every recurring
// review lives inside one of these; Financial Statements, Investigations,
// and eventually Decisions attach to a cycle via review_cycle_id (nullable
// on those tables - a statement/investigation can exist outside any
// cycle, matching how the app worked before this phase). status IS
// constrained by a DB CHECK constraint (sentinel_review_cycles_status_check)
// to exactly these six values - confirmed directly from the live schema,
// not assumed. LIFECYCLE order in the Review Cycles page mirrors this
// exactly for valid forward transitions.
export type ReviewCyclePeriodType = "monthly" | "quarterly" | "annual";

export type ReviewCycleStatus =
  | "draft"
  | "importing"
  | "analyzing"
  | "in_review"
  | "approved"
  | "closed";

export type ReviewCycle = {
  id: string;
  workspace_id: string;
  label: string;
  period_type: ReviewCyclePeriodType;
  status: ReviewCycleStatus;
  opened_at: string;
  closed_at: string | null;
  created_by: string;
  created_at: string;
};

export type RecommendationPriority = "High" | "Medium" | "Low";
export type RecommendationDifficulty = "Easy" | "Medium" | "Hard";
export type RecommendationStatus = "pending" | "approved" | "rejected" | "implemented";

// Recommendation Engine (Phase A/B) - structured recommendations,
// separated from investigations per the roadmap. confidence_score is
// always inherited from the parent investigation's own computed score
// at generation time, never asked of Claude directly - same rule as
// everywhere else in Sentinel.
export type Recommendation = {
  id: string;
  workspace_id: string;
  investigation_id: string | null;
  review_cycle_id: string | null;
  owner_id: string;
  title: string;
  priority: RecommendationPriority;
  business_value: string;
  financial_impact: string | null;
  owner: string;
  timeline: string;
  difficulty: RecommendationDifficulty;
  confidence_score: number | null;
  evidence: string | null;
  status: RecommendationStatus;
  created_at: string;
  updated_at: string;
};
