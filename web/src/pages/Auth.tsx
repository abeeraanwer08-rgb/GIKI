import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Banner, Button, Logo, TextField } from '../components/ui';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Mode = 'signIn' | 'signUp';
type Errors = { name?: string; email?: string; password?: string };

function validate(mode: Mode, name: string, email: string, password: string): Errors {
  const errors: Errors = {};
  if (mode === 'signUp' && !name.trim()) errors.name = 'Enter your name.';
  if (!EMAIL.test(email.trim())) errors.email = 'Enter a valid email address.';
  if (mode === 'signUp' && password.length < 8) errors.password = 'Use at least 8 characters.';
  else if (!password) errors.password = 'Enter your password.';
  return errors;
}

export default function Auth({ initialMode = 'signIn' }: { initialMode?: Mode }) {
  const { status, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'signedIn') return <Navigate to="/app" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const found = validate(mode, name, email, password);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      if (mode === 'signIn') await signIn(email.trim(), password);
      else await signUp(name.trim(), email.trim(), password);
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.status === 401 ? 'Incorrect email or password.'
          : error.status === 409 ? 'An account with this email already exists.'
          : error.message
          : 'Something went wrong. Please try again.',
      );
      setBusy(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrors({});
    setFormError(null);
  };

  const signUpMode = mode === 'signUp';

  return (
    <div className="auth">
      <aside className="auth-aside">
        <Link to="/" className="brand" style={{ color: '#fff' }}>
          <Logo /> HissabAI
        </Link>
        <div>
          <h2>Know where every rupee goes.</h2>
          <p>Scan receipts and bank statements, track budgets, and ask questions in English or Urdu.</p>
        </div>
        <span style={{ color: 'rgba(255,255,255,.6)', fontSize: 13 }}>Your expenses stay private to your account.</span>
      </aside>
      <main className="auth-main">
        <form className="auth-card" onSubmit={submit} noValidate>
          <Link to="/" className="brand" style={{ display: 'none' }}>HissabAI</Link>
          <div>
            <h2 style={{ fontSize: 28 }}>{signUpMode ? 'Create your account' : 'Welcome back'}</h2>
            <p className="muted" style={{ marginTop: 6 }}>
              {signUpMode ? 'It takes less than a minute.' : 'Sign in to see your spending.'}
            </p>
          </div>

          <div className="segmented" role="tablist">
            <button type="button" role="tab" aria-selected={!signUpMode} onClick={() => switchMode('signIn')}>Sign in</button>
            <button type="button" role="tab" aria-selected={signUpMode} onClick={() => switchMode('signUp')}>Create account</button>
          </div>

          {formError && <Banner tone="danger">{formError}</Banner>}

          {signUpMode && (
            <TextField label="Your name" value={name} onChange={setName} error={errors.name} autoComplete="name" placeholder="Ali Khan" />
          )}
          <TextField label="Email" type="email" value={email} onChange={setEmail} error={errors.email} autoComplete="email" placeholder="you@example.com" />
          <TextField
            label="Password" secret value={password} onChange={setPassword} error={errors.password}
            autoComplete={signUpMode ? 'new-password' : 'current-password'}
            placeholder={signUpMode ? 'At least 8 characters' : 'Your password'}
          />
          <Button type="submit" block loading={busy}>{signUpMode ? 'Create account' : 'Sign in'}</Button>
          <p className="faint" style={{ textAlign: 'center', fontSize: 13 }}>
            <Link to="/">← Back to home</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
