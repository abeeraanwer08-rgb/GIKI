import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthError, fetchMe, logIn, resendVerification, signUp, verifyEmail } from './authApi';
import {
  Session,
  SessionUser,
  clearSession,
  loadSession,
  saveSession,
  setToken,
  setUnauthorizedHandler,
} from './session';

type Status = 'loading' | 'signedOut' | 'unverified' | 'signedIn';

interface AuthContextValue {
  status: Status;
  user: SessionUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Confirms the emailed code; on success the app opens. */
  verifyEmail: (code: string) => Promise<void>;
  resendVerification: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [token, setCurrentToken] = useState<string | null>(null);

  // Sessions saved before verification existed carry no flag: treat them as verified.
  const statusFor = (u: SessionUser): Status => (u.email_verified === false ? 'unverified' : 'signedIn');

  const apply = useCallback(async (session: Session) => {
    setToken(session.token);
    setCurrentToken(session.token);
    await saveSession(session);
    setUser(session.user);
    setStatus(statusFor(session.user));
  }, []);

  const signOut = useCallback(async () => {
    setToken(null);
    setCurrentToken(null);
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
      setCurrentToken(saved.token);
      setUser(saved.user);
      setStatus(statusFor(saved.user));
      try {
        const fresh = await fetchMe(saved.token);
        if (!cancelled && fresh.email_verified !== saved.user.email_verified) {
          setUser(fresh);
          setStatus(statusFor(fresh));
          await saveSession({ token: saved.token, user: fresh });
        }
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
      verifyEmail: async (code) => {
        if (!token) throw new AuthError('Please sign in again.', 401);
        const verified = await verifyEmail(token, code);
        await saveSession({ token, user: verified });
        setUser(verified);
        setStatus('signedIn');
      },
      resendVerification: async () => {
        if (!token) throw new AuthError('Please sign in again.', 401);
        await resendVerification(token);
      },
    }),
    [status, user, token, apply, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}
