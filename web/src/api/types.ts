export interface User { id: string; name: string; email: string }
export interface AuthResponse { token: string; user: User }

export interface RecordSummary {
  id: string;
  document_type: string;
  merchant: string | null;
  transaction_date: string | null;
  amount: number | null;
  currency: string | null;
  category: string | null;
}

export interface RecordsPage { records: RecordSummary[]; total: number; limit: number; offset: number; has_more: boolean }

export interface CategoryTotal { category: string; total_amount: number; record_count: number }
export interface MonthlyTotal { month: string; total_amount: number; record_count: number }
export interface MonthForecast { month: string; spent_to_date: number; days_elapsed: number; days_in_month: number; projected_total: number }
export interface SpendingAnomaly {
  record_id: string | null; merchant: string | null; category: string; amount: number;
  typical_amount: number; ratio: number; transaction_date: string | null;
}

export interface FinancialSummary {
  record_count: number;
  total_amount: number;
  currency: string | null;
  by_category: CategoryTotal[];
  by_month: MonthlyTotal[];
  top_merchants: CategoryTotal[];
  current_month: MonthForecast | null;
  anomalies: SpendingAnomaly[];
  start_date?: string | null;
  end_date?: string | null;
}

export interface InsightsResponse { summary: FinancialSummary; headline: string; insights: string[]; recommendations: string[] }
export interface AskResponse { question: string; answer: string }

export type BudgetState = 'on_track' | 'warning' | 'over';
export interface BudgetStatus { category: string; monthly_limit: number; spent: number; remaining: number; percent_used: number; status: BudgetState }
export interface BudgetOverview { month: string; currency: string; total_limit: number; total_spent: number; alerts: number; budgets: BudgetStatus[] }

// ── Upload / review ──────────────────────────────────────────────────────────
export type ScanType = 'auto' | 'receipt' | 'bank_statement' | 'utility_bill' | 'wallet_screenshot';

export interface ReviewItem {
  description: string;
  amount: number | null;
  quantity?: number | null;
  unit_price?: number | null;
  category?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ReviewResponse {
  document_type: string;
  editable_fields: Record<string, { value?: unknown }>;
  extracted_items: ReviewItem[];
  validation_warnings: string[];
  review_hints: { field: string; message: string }[];
  overall_confidence: number | null;
  processing_metadata: Record<string, unknown>;
}

export interface SavePayload {
  record_id: string;
  document_type: string;
  merchant: string | null;
  document_date: string | null;
  currency: string | null;
  total_amount: number | null;
  payment_method: string | null;
  category: string | null;
  items: { description: string; amount: number | null; quantity: number | null; unit_price: number | null; category: string | null; metadata: Record<string, unknown> }[];
  metadata: Record<string, unknown> & { source: string; parser_version: string };
}

export interface SaveResponse { saved: boolean; record_id: string; document_type: string; category?: string | null; records_saved?: number }
