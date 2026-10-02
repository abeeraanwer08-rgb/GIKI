import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Banner, Button, Logo, TextField } from '../components/ui';

const RESEND_SECONDS = 60;

/** Shown after sign-up (or sign-in) until the emailed 6-digit code has been entered. */
export default function Verify() {
  const { status, user, verifyEmail, resendVerification, signOut } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS); // a code was just emailed

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  if (status === 'signedOut') return <Navigate to="/signin" replace />;
  if (status === 'signedIn') return <Navigate to="/app" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await verifyEmail(code.trim());
    } catch (e2) {
      setError(e2 instanceof ApiError ? e2.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0) return;
    setError(null);
    try {
      await resendVerification();
      setNotice('We’ve sent a new code.');
      setCooldown(RESEND_SECONDS);
    } catch (e2) {
      if (e2 instanceof ApiError && e2.retryAfter) setCooldown(e2.retryAfter);
      setError(e2 instanceof ApiError ? e2.message : 'Could not send a new code.');
    }
  };

  return (
    <div className="auth">
      <aside className="auth-aside">
        <Link to="/" className="brand" style={{ color: '#fff' }}><Logo /> HissabAI</Link>
        <div>
          <h2>One quick step.</h2>
          <p>We email a code to make sure the address is really yours, so only you can reset your password later.</p>
        </div>
        <span style={{ color: 'rgba(255,255,255,.6)', fontSize: 13 }}>The code expires in 15 minutes.</span>
      </aside>
      <main className="auth-main">
        <form className="auth-card" onSubmit={submit} noValidate>
          <div>
            <h2 style={{ fontSize: 28 }}>Check your email</h2>
            <p className="muted" style={{ marginTop: 6 }}>We sent a 6-digit code to <b>{user?.email}</b>.</p>
          </div>
          {error && <Banner tone="danger">{error}</Banner>}
          {notice && !error && <Banner tone="ok">✅ {notice}</Banner>}
          <TextField label="Verification code" value={code} onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} autoComplete="one-time-code" placeholder="123456" />
          <Button type="submit" block loading={busy}>Verify email</Button>
          <p style={{ textAlign: 'center' }}>
            <button type="button" className="link-btn" onClick={resend} disabled={cooldown > 0}>
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </button>
          </p>
          <p className="faint" style={{ textAlign: 'center', fontSize: 13 }}>
            Can’t find it? Check your spam folder. <button type="button" className="link-btn" onClick={signOut}>Use a different account</button>
          </p>
        </form>
      </main>
    </div>
  );
}
