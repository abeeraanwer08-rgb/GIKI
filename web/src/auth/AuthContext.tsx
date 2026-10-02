import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from '../api/client';
import type { User } from '../api/types';

type Status = 'loading' | 'signedOut' | 'signedIn';

type AuthValue = {
  status: Status;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

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
    if (!tokenStore.get()) return () => setUnauthorizedHandler(null);
    let cancelled = false;
    api.me().then(
      (me) => {
        if (cancelled) return;
        setUser(me);
        setStatus('signedIn');
      },
      () => {
        if (!cancelled) signOut();
      },
    );
    return () => {
      cancelled = true;
      setUnauthorizedHandler(null);
    };
  }, [signOut]);

  const finish = useCallback((token: string, me: User) => {
    tokenStore.set(token);
    setUser(me);
    setStatus('signedIn');
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
