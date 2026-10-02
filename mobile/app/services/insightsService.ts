import { API_BASE_URL } from '../config/api';
import { authHeaders, notifyIfUnauthorized } from '../auth/session';
import {
  AskResponse,
  BudgetOverview,
  FinancialSummary,
  InsightsResponse,
  RecordsPage,
} from '../types/insights';
import { DateRange } from '../utils/period';

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
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { ...authHeaders(), ...(init?.headers as Record<string, string> | undefined) },
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  if (!response.ok) {
    notifyIfUnauthorized(response.status);
    throw new ApiError(response.status, `Request failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as T;
}

function rangeQuery({ startDate, endDate }: DateRange = {}, extra: Record<string, string | number | undefined> = {}) {
  const params: string[] = [];
  const all: Record<string, string | number | undefined> = { start_date: startDate, end_date: endDate, ...extra };
  for (const [key, value] of Object.entries(all)) {
    if (value !== undefined && value !== '') params.push(`${key}=${encodeURIComponent(String(value))}`);
  }
  return params.length ? `?${params.join('&')}` : '';
}

export const RECORDS_PAGE_SIZE = 30;

/** One page of saved records, most recent first, optionally limited to a category / date range. */
export async function fetchFinancialRecordsPage(
  options: { offset?: number; limit?: number; category?: string | null } & DateRange = {},
): Promise<RecordsPage> {
  const { offset = 0, limit = RECORDS_PAGE_SIZE, category, ...range } = options;
  return getJson<RecordsPage>(
    `/api/v1/financial-records${rangeQuery(range, { limit, offset, category: category ?? undefined })}`,
  );
}

/** Fetch the deterministic spending summary plus AI-generated insights for a period. */
export async function fetchInsights(range: DateRange = {}): Promise<InsightsResponse> {
  return getJson<InsightsResponse>(`/api/v1/insights${rangeQuery(range)}`);
}

/** Ask a free-form question, grounded in the same deterministic summary. */
export async function askInsights(question: string, range: DateRange = {}): Promise<AskResponse> {
  return getJson<AskResponse>(`/api/v1/insights/ask${rangeQuery(range)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
}

/** Deterministic summary (forecast, anomalies, breakdowns) — no LLM call, cheap to refresh. */
export async function fetchSummary(range: DateRange = {}): Promise<FinancialSummary> {
  return getJson<FinancialSummary>(`/api/v1/insights/summary${rangeQuery(range)}`);
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
