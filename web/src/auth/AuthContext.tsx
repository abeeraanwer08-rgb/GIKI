import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler, setUnverifiedHandler, tokenStore } from '../api/client';
import type { User } from '../api/types';

type Status = 'loading' | 'signedOut' | 'unverified' | 'signedIn';

type AuthValue = {
  status: Status;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => void;
  /** Confirms the emailed code; on success the app opens. */
  verifyEmail: (code: string) => Promise<void>;
  resendVerification: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

const statusFor = (user: User): Status => (user.email_verified === false ? 'unverified' : 'signedIn');

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(() => (tokenStore.get() ? 'loading' : 'signedOut'));
  const [user, setUser] = useState<User | null>(null);

  const signOut = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
    setStatus('signedOut');
  }, []);

  // Restore a saved session; an expired or revoked token just returns to the sign-in page.
  useEffect(() => {
    setUnauthorizedHandler(signOut);
    setUnverifiedHandler(() => setStatus((s) => (s === 'signedIn' ? 'unverified' : s)));
    if (!tokenStore.get()) {
      return () => {
        setUnauthorizedHandler(null);
        setUnverifiedHandler(null);
      };
    }
    let cancelled = false;
    api.me().then(
      (me) => {
        if (cancelled) return;
        setUser(me);
        setStatus(statusFor(me));
      },
      () => {
        if (!cancelled) signOut();
      },
    );
    return () => {
      cancelled = true;
      setUnauthorizedHandler(null);
      setUnverifiedHandler(null);
    };
  }, [signOut]);

  const finish = useCallback((token: string, me: User) => {
    tokenStore.set(token);
    setUser(me);
    setStatus(statusFor(me));
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      signIn: async (email, password) => {
        const { token, user: me } = await api.signIn(email, password);
        finish(token, me);
      },
      signUp: async (name, email, password) => {
        const { token, user: me } = await api.signUp(name, email, password);
        finish(token, me);
      },
      signOut,
      verifyEmail: async (code) => {
        const me = await api.verifyEmail(code);
        setUser(me);
        setStatus('signedIn');
      },
      resendVerification: async () => {
        await api.resendVerification();
      },
    }),
    [status, user, finish, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
