import type {
  AskResponse, AuthResponse, BudgetOverview, FinancialSummary, InsightsResponse, RecordsPage,
  ReviewResponse, SavePayload, SaveResponse, ScanType, User,
} from './types';
import type { DateRange } from '../lib/period';

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/+$/, '');

const TOKEN_KEY = 'hissabai.token';

export const tokenStore = {
  get(): string | null {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(token: string | null): void {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch { /* storage unavailable: the session just won't persist */ }
  },
};

/** A non-2xx answer from the API, with the server's detail kept for callers that need it. */
export class ApiError extends Error {
  constructor(public readonly status: number, public readonly detail: unknown, message: string) {
    super(message);
  }
  /** Seconds until a rate-limited action may be retried (HTTP 429). */
  get retryAfter(): number | undefined {
    const detail = this.detail as { retry_after?: number } | null;
    return detail && typeof detail === 'object' ? detail.retry_after : undefined;
  }
  /** `detail.error` / `detail.status` style codes the backend uses. */
  get code(): string | undefined {
    const detail = this.detail as { error?: string; status?: string } | string | null;
    if (detail && typeof detail === 'object') return detail.error ?? detail.status;
    return undefined;
  }
}

let onUnauthorized: (() => void) | null = null;
let onUnverified: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}
export function setUnverifiedHandler(handler: (() => void) | null): void {
  onUnverified = handler;
}

function messageFor(status: number, detail: unknown): string {
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 413) return 'That file is too large. Use files under 10 MB each (25 MB in total).';
  if (status === 415) return 'That file type isn’t supported. Use a JPEG, PNG or WebP image, or a PDF.';
  const unavailable = (detail as { message?: string } | null)?.message;
  if (status === 502 || status === 503) return unavailable ?? 'The service is temporarily unavailable. Please try again shortly.';
  const d = detail as { error?: string; message?: string; errors?: string[] } | { msg?: string }[] | string | null;
  if (typeof d === 'string') return d;
  // FastAPI validation errors arrive as a list: "Value error, Enter a valid email address."
  if (Array.isArray(d) && d[0]?.msg) return d[0].msg.replace(/^Value error,\s*/, '');
  if (d && !Array.isArray(d)) {
    if (d.errors?.length) return d.errors.join(' ');
    if (d.message) return d.message;
    if (d.error) return d.error;
  }
  return `Request failed (HTTP ${status}).`;
}

async function request<T>(path: string, init: RequestInit = {}, { auth = true } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (auth && token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, null, 'Could not reach the server. Check your connection and try again.');
  }

  let body: unknown = null;
  try { body = await response.json(); } catch { /* empty or non-JSON body */ }

  if (!response.ok) {
    const detail = (body as { detail?: unknown } | null)?.detail ?? null;
    // A wrong password is a 401 too; only an expired session on a signed-in call should sign out.
    if (response.status === 401 && auth && token) onUnauthorized?.();
    // Unverified accounts are sent to the verification page instead of seeing a raw error.
    if (response.status === 403 && (detail as { error?: string } | null)?.error === 'email_not_verified') onUnverified?.();
    throw new ApiError(response.status, detail, messageFor(response.status, detail));
  }
  return body as T;
}

function query(params: Record<string, string | number | undefined | null>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const rangeParams = (range: DateRange) => ({ start_date: range.startDate, end_date: range.endDate });

export const api = {
  signIn: (email: string, password: string) =>
    request<AuthResponse>('/api/v1/auth/login', json({ email, password }), { auth: false }),
  signUp: (name: string, email: string, password: string) =>
    request<AuthResponse>('/api/v1/auth/signup', json({ name, email, password }), { auth: false }),
  me: () => request<User>('/api/v1/auth/me'),
  verifyEmail: (code: string) => request<User>('/api/v1/auth/verify-email', json({ code })),
  resendVerification: () => request<{ message: string }>('/api/v1/auth/resend-verification', json({})),
  forgotPassword: (email: string) =>
    request<{ message: string }>('/api/v1/auth/forgot-password', json({ email }), { auth: false }),
  resetPassword: (email: string, code: string, newPassword: string) =>
    request<{ message: string }>('/api/v1/auth/reset-password', json({ email, code, new_password: newPassword }), { auth: false }),

  records: (opts: { limit?: number; offset?: number; category?: string | null } & DateRange = {}) =>
    request<RecordsPage>(
      `/api/v1/financial-records${query({ limit: opts.limit, offset: opts.offset, category: opts.category, ...rangeParams(opts) })}`,
    ),
  summary: (range: DateRange = {}) =>
    request<FinancialSummary>(`/api/v1/insights/summary${query(rangeParams(range))}`),
  insights: (range: DateRange = {}) =>
    request<InsightsResponse>(`/api/v1/insights${query(rangeParams(range))}`),
  ask: (question: string, range: DateRange = {}) =>
    request<AskResponse>(`/api/v1/insights/ask${query(rangeParams(range))}`, json({ question })),

  budgets: () => request<BudgetOverview>('/api/v1/budgets'),
  setBudget: (category: string, monthlyLimit: number) =>
    request<BudgetOverview>(`/api/v1/budgets/${encodeURIComponent(category)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthly_limit: monthlyLimit }),
    }),
  deleteBudget: (category: string) =>
    request<BudgetOverview>(`/api/v1/budgets/${encodeURIComponent(category)}`, { method: 'DELETE' }),

  /** One file, or the pages of one document in order (images and/or a PDF). */
  upload: (files: File[], documentType: ScanType) => {
    const form = new FormData();
    for (const file of files) form.append('file', file);
    if (documentType !== 'auto') form.append('document_type', documentType);
    return request<ReviewResponse>('/api/v1/receipt/upload', { method: 'POST', body: form });
  },
  save: (payload: SavePayload) => request<SaveResponse>('/api/v1/financial-records', json(payload)),
};
