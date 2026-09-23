import { API_BASE_URL } from '../config/api';
import {
  AskResponse,
  BudgetOverview,
  FinancialRecordSummary,
  FinancialSummary,
  InsightsResponse,
} from '../types/insights';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, init);
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  if (!response.ok) {
    throw new ApiError(response.status, `Request failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as T;
}

/** Fetch saved financial records, most recent first, for the Home transaction list. */
export async function fetchFinancialRecords(): Promise<FinancialRecordSummary[]> {
  const body = await getJson<{ records: FinancialRecordSummary[] }>(
    '/api/v1/financial-records',
  );
  return body.records;
}

/** Fetch the deterministic spending summary plus AI-generated insights. */
export async function fetchInsights(): Promise<InsightsResponse> {
  return getJson<InsightsResponse>('/api/v1/insights');
}

/** Ask a free-form question, grounded in the same deterministic summary. */
export async function askInsights(question: string): Promise<AskResponse> {
  return getJson<AskResponse>('/api/v1/insights/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
}

/** Deterministic summary (forecast, anomalies, breakdowns) — no LLM call, cheap to refresh. */
export async function fetchSummary(): Promise<FinancialSummary> {
  return getJson<FinancialSummary>('/api/v1/insights/summary');
}

export async function fetchBudgets(): Promise<BudgetOverview> {
  return getJson<BudgetOverview>('/api/v1/budgets');
}

export async function setBudget(category: string, monthlyLimit: number): Promise<BudgetOverview> {
  return getJson<BudgetOverview>(`/api/v1/budgets/${encodeURIComponent(category)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ monthly_limit: monthlyLimit }),
  });
}

export async function deleteBudget(category: string): Promise<BudgetOverview> {
  return getJson<BudgetOverview>(`/api/v1/budgets/${encodeURIComponent(category)}`, {
    method: 'DELETE',
  });
}
