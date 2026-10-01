import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthError, fetchMe, logIn, signUp } from './authApi';
import {
  Session,
  SessionUser,
  clearSession,
  loadSession,
  saveSession,
  setToken,
  setUnauthorizedHandler,
} from './session';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: Status;
  user: SessionUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);

  const apply = useCallback(async (session: Session) => {
    setToken(session.token);
    await saveSession(session);
    setUser(session.user);
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    setToken(null);
    await clearSession();
    setUser(null);
    setStatus('signedOut');
  }, []);

  // Restore a saved session on launch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadSession();
      if (cancelled) return;
      if (!saved) {
        setStatus('signedOut');
        return;
      }
      // Show the app immediately, then confirm the token is still valid.
      setToken(saved.token);
      setUser(saved.user);
      setStatus('signedIn');
      try {
        await fetchMe(saved.token);
      } catch (error) {
        // Only an explicit rejection signs out; being offline must not lock the user out.
        if (!cancelled && error instanceof AuthError && error.status === 401) await signOut();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signOut]);

  // Any API call that comes back 401 while signed in ends the session.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      signIn: async (email, password) => apply(await logIn(email, password)),
      signUp: async (name, email, password) => apply(await signUp(name, email, password)),
      signOut,
    }),
    [status, user, apply, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}
