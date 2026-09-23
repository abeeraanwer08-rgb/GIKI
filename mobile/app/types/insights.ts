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

export interface FinancialSummary {
  record_count: number;
  total_amount: number;
  currency: string | null;
  by_category: CategoryTotal[];
  by_month: MonthlyTotal[];
  top_merchants: CategoryTotal[];
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
