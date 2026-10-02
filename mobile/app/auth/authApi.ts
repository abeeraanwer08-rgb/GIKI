import { API_BASE_URL } from '../config/api';
import { Session, SessionUser } from './session';

/** A failure with a message that can be shown to the user as-is. */
export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    /** Seconds until a rate-limited action may be retried (HTTP 429). */
    public readonly retryAfter?: number,
  ) {
    super(message);
  }
}

type ErrorBody = { detail?: { error?: string; retry_after?: number } | { msg?: string }[] } | null;

function messageFrom(status: number, body: ErrorBody): string {
  const detail = body?.detail;
  if (Array.isArray(detail) && detail[0]?.msg) {
    // FastAPI validation error: "Value error, Enter a valid email address."
    return detail[0].msg.replace(/^Value error,\s*/, '');
  }
  if (detail && !Array.isArray(detail) && detail.error) return detail.error;
  if (status >= 500) return 'Something went wrong on our side. Please try again.';
  return 'Something went wrong. Please try again.';
}

async function request<T>(
  path: string,
  { method = 'POST', body, token }: { method?: 'GET' | 'POST'; body?: unknown; token?: string } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new AuthError('Could not reach the server. Check your connection and try again.', null);
  }

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    // Non-JSON error bodies fall through to the generic message.
  }
  if (!response.ok) {
    const retryAfter = (parsed as { detail?: { retry_after?: number } } | null)?.detail?.retry_after;
    throw new AuthError(messageFrom(response.status, parsed as ErrorBody), response.status, retryAfter);
  }
  return parsed as T;
}

export function signUp(name: string, email: string, password: string): Promise<Session> {
  return request<Session>('/api/v1/auth/signup', { body: { name, email, password } });
}

export function logIn(email: string, password: string): Promise<Session> {
  return request<Session>('/api/v1/auth/login', { body: { email, password } });
}

/** Validates a stored token; throws AuthError(status 401) when it is no longer accepted. */
export function fetchMe(token: string): Promise<SessionUser> {
  return request<SessionUser>('/api/v1/auth/me', { method: 'GET', token });
}

export function verifyEmail(token: string, code: string): Promise<SessionUser> {
  return request<SessionUser>('/api/v1/auth/verify-email', { token, body: { code } });
}

export async function resendVerification(token: string): Promise<void> {
  await request('/api/v1/auth/resend-verification', { token, body: {} });
}

/** Always succeeds from the user's point of view: the server answers the same for unknown emails. */
export async function forgotPassword(email: string): Promise<void> {
  await request('/api/v1/auth/forgot-password', { body: { email } });
}

export async function resetPassword(email: string, code: string, newPassword: string): Promise<void> {
  await request('/api/v1/auth/reset-password', { body: { email, code, new_password: newPassword } });
}
