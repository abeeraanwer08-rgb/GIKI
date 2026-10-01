import { API_BASE_URL } from '../config/api';
import { Session, SessionUser } from './session';

/** A sign-in failure with a message that can be shown to the user as-is. */
export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
  ) {
    super(message);
  }
}

type ErrorBody = { detail?: { error?: string } | { msg?: string }[] } | null;

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

async function send<T>(path: string, payload: unknown, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: token ? 'GET' : 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' }),
      },
      body: token ? undefined : JSON.stringify(payload),
    });
  } catch {
    throw new AuthError('Could not reach the server. Check your connection and try again.', null);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON error bodies fall through to the generic message.
  }
  if (!response.ok) throw new AuthError(messageFrom(response.status, body as ErrorBody), response.status);
  return body as T;
}

export function signUp(name: string, email: string, password: string): Promise<Session> {
  return send<Session>('/api/v1/auth/signup', { name, email, password });
}

export function logIn(email: string, password: string): Promise<Session> {
  return send<Session>('/api/v1/auth/login', { email, password });
}

/** Validates a stored token; throws AuthError(status 401) when it is no longer accepted. */
export function fetchMe(token: string): Promise<SessionUser> {
  return send<SessionUser>('/api/v1/auth/me', undefined, token);
}
