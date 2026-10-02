import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Banner, Button, Logo, TextField } from '../components/ui';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Mode = 'signIn' | 'signUp' | 'forgot' | 'reset';
type Errors = { name?: string; email?: string; password?: string; code?: string };

function validate(mode: Mode, name: string, email: string, password: string, code: string): Errors {
  const errors: Errors = {};
  if (mode === 'signUp' && !name.trim()) errors.name = 'Enter your name.';
  if (!EMAIL.test(email.trim())) errors.email = 'Enter a valid email address.';
  if (mode === 'forgot') return errors;
  if (mode === 'reset' && !/^\d{6}$/.test(code.trim())) errors.code = 'Enter the 6-digit code from the email.';
  if ((mode === 'signUp' || mode === 'reset') && password.length < 8) errors.password = 'Use at least 8 characters.';
  else if (!password) errors.password = 'Enter your password.';
  return errors;
}

function messageFor(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  if (error.status === 401) return 'Incorrect email or password.';
  if (error.status === 409) return 'An account with this email already exists.';
  return error.message;
}

export default function Auth({ initialMode = 'signIn' }: { initialMode?: Mode }) {
  const { status, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'signedIn') return <Navigate to="/app" replace />;
  if (status === 'unverified') return <Navigate to="/verify" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const found = validate(mode, name, email, password, code);
    setErrors(found);
    setFormError(null);
    setNotice(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      if (mode === 'signIn') await signIn(email.trim(), password);
      else if (mode === 'signUp') await signUp(name.trim(), email.trim(), password);
      else if (mode === 'forgot') {
        await api.forgotPassword(email.trim());
        setNotice('If an account exists for that email, we’ve sent a 6-digit code.');
        setMode('reset');
        setBusy(false);
      } else {
        await api.resetPassword(email.trim(), code.trim(), password);
        setNotice('Password reset. Sign in with your new password.');
        setPassword('');
        setCode('');
        setMode('signIn');
        setBusy(false);
      }
    } catch (error) {
      setFormError(messageFor(error));
      setBusy(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrors({});
    setFormError(null);
    setNotice(null);
  };

  const signUpMode = mode === 'signUp';
  const recovery = mode === 'forgot' || mode === 'reset';
  const newPassword = signUpMode || mode === 'reset';

  const heading = {
    signIn: ['Welcome back', 'Sign in to see your spending.'],
    signUp: ['Create your account', 'It takes less than a minute.'],
    forgot: ['Forgot your password?', 'Enter your email and we’ll send you a 6-digit code to reset it.'],
    reset: ['Enter your code', 'Enter the code we emailed you and choose a new password.'],
  }[mode];

  return (
    <div className="auth">
      <aside className="auth-aside">
        <Link to="/" className="brand" style={{ color: '#fff' }}>
          <Logo /> HissabAI
        </Link>
        <div>
          <h2>Know where every rupee goes.</h2>
          <p>Scan receipts, invoices and bank statements, track budgets, and ask questions in English or Urdu.</p>
        </div>
        <span style={{ color: 'rgba(255,255,255,.6)', fontSize: 13 }}>Your expenses stay private to your account.</span>
      </aside>
      <main className="auth-main">
        <form className="auth-card" onSubmit={submit} noValidate>
          <div>
            <h2 style={{ fontSize: 28 }}>{heading[0]}</h2>
            <p className="muted" style={{ marginTop: 6 }}>{heading[1]}</p>
          </div>

          {!recovery && (
            <div className="segmented" role="tablist">
              <button type="button" role="tab" aria-selected={!signUpMode} onClick={() => switchMode('signIn')}>Sign in</button>
              <button type="button" role="tab" aria-selected={signUpMode} onClick={() => switchMode('signUp')}>Create account</button>
            </div>
          )}

          {notice && !formError && <Banner tone="ok">✅ {notice}</Banner>}
          {formError && <Banner tone="danger">{formError}</Banner>}

          {signUpMode && (
            <TextField label="Your name" value={name} onChange={setName} error={errors.name} autoComplete="name" placeholder="Ali Khan" />
          )}
          <TextField label="Email" type="email" value={email} onChange={setEmail} error={errors.email} autoComplete="email" placeholder="you@example.com" />
          {mode === 'reset' && (
            <TextField label="6-digit code" value={code} onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} error={errors.code} autoComplete="one-time-code" placeholder="123456" />
          )}
          {mode !== 'forgot' && (
            <TextField
              label={mode === 'reset' ? 'New password' : 'Password'} secret value={password} onChange={setPassword} error={errors.password}
              autoComplete={newPassword ? 'new-password' : 'current-password'}
              placeholder={newPassword ? 'At least 8 characters' : 'Your password'}
            />
          )}
          {mode === 'signIn' && (
            <button type="button" className="link-btn" onClick={() => switchMode('forgot')}>Forgot password?</button>
          )}

          <Button type="submit" block loading={busy}>
            {{ signIn: 'Sign in', signUp: 'Create account', forgot: 'Send code', reset: 'Reset password' }[mode]}
          </Button>
          <p className="faint" style={{ textAlign: 'center', fontSize: 13 }}>
            {recovery ? <button type="button" className="link-btn" onClick={() => switchMode('signIn')}>← Back to sign in</button> : <Link to="/">← Back to home</Link>}
          </p>
        </form>
      </main>
    </div>
  );
}
