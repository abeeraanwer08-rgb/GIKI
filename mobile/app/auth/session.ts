import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KEY = 'hissabai.session';

/** The signed-in user as returned by the backend. */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  /** false until the emailed code has been entered. Older saved sessions omit it. */
  email_verified?: boolean;
}

export interface Session {
  token: string;
  user: SessionUser;
}

// SecureStore is unavailable on web (used only for local previews), so fall back to localStorage there.
const webStore = {
  get: async () => globalThis.localStorage?.getItem(KEY) ?? null,
  set: async (value: string) => globalThis.localStorage?.setItem(KEY, value),
  clear: async () => globalThis.localStorage?.removeItem(KEY),
};

const nativeStore = {
  get: () => SecureStore.getItemAsync(KEY),
  set: (value: string) => SecureStore.setItemAsync(KEY, value),
  clear: () => SecureStore.deleteItemAsync(KEY),
};

const store = Platform.OS === 'web' ? webStore : nativeStore;

export async function loadSession(): Promise<Session | null> {
  try {
    const raw = await store.get();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    return parsed.token && parsed.user ? (parsed as Session) : null;
  } catch {
    return null;
  }
}

export async function saveSession(session: Session): Promise<void> {
  await store.set(JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  try {
    await store.clear();
  } catch {
    // Nothing to clear is fine.
  }
}

// ── In-memory token used by every API call ────────────────────────────────────

let currentToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setToken(token: string | null): void {
  currentToken = token;
}

/** Registered once by the auth provider so any 401 signs the user out. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

export function authHeaders(): Record<string, string> {
  return currentToken ? { Authorization: `Bearer ${currentToken}` } : {};
}

/** Call with every response; a 401 while signed in means the session expired. */
export function notifyIfUnauthorized(status: number): void {
  if (status === 401 && currentToken) onUnauthorized?.();
}
