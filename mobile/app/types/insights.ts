export interface FinancialRecordSummary {
  id: string;
  document_type: string;
  merchant: string | null;
  transaction_date: string | null;
  amount: number | null;
  currency: string | null;
  category: string | null;
}

export interface CategoryTotal {
  category: string;
  total_amount: number;
  record_count: number;
}

export interface MonthlyTotal {
  month: string;
  total_amount: number;
  record_count: number;
}

export interface MonthForecast {
  month: string;
  spent_to_date: number;
  days_elapsed: number;
  days_in_month: number;
  projected_total: number;
}

export interface SpendingAnomaly {
  record_id: string | null;
  merchant: string | null;
  category: string;
  amount: number;
  typical_amount: number;
  ratio: number;
  transaction_date: string | null;
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
}

export type BudgetState = 'on_track' | 'warning' | 'over';

export interface BudgetStatus {
  category: string;
  monthly_limit: number;
  spent: number;
  remaining: number;
  percent_used: number;
  status: BudgetState;
}

export interface BudgetOverview {
  month: string;
  currency: string;
  total_limit: number;
  total_spent: number;
  alerts: number;
  budgets: BudgetStatus[];
}

export interface InsightsResponse {
  summary: FinancialSummary;
  headline: string;
  insights: string[];
  recommendations: string[];
}

export interface AskResponse {
  question: string;
  answer: string;
}
