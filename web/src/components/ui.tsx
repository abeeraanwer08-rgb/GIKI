import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { categoryStyle } from '../lib/categories';
import { capitalize } from '../lib/format';

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#15A06A" />
          <stop offset="1" stopColor="#063A26" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#logo-g)" />
      <rect x="16" y="34" width="8" height="14" rx="3" fill="#fff" opacity=".55" />
      <rect x="28" y="26" width="8" height="22" rx="3" fill="#fff" opacity=".8" />
      <rect x="40" y="16" width="8" height="32" rx="3" fill="#fff" />
      <path d="M16 28 29 19l9 4 12-12" stroke="#F5C451" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'light';
  small?: boolean;
  block?: boolean;
  loading?: boolean;
};

export function Button({ variant = 'primary', small, block, loading, children, disabled, className = '', ...rest }: ButtonProps) {
  const classes = ['btn', `btn-${variant}`, small ? 'btn-sm' : '', block ? 'btn-block' : '', className].filter(Boolean).join(' ');
  return (
    <button {...rest} className={classes} disabled={disabled || loading}>
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Spinner() {
  return <span className="spinner" role="status" aria-label="Loading" />;
}

export function Skeleton({ height = 16, width = '100%', radius }: { height?: number; width?: number | string; radius?: number }) {
  return <div className="skeleton" style={{ height, width, borderRadius: radius }} aria-hidden="true" />;
}

export function EmptyState({ glyph = '🧾', title, body, action, danger }: { glyph?: string; title: string; body: string; action?: ReactNode; danger?: boolean }) {
  return (
    <div className={`empty${danger ? ' danger' : ''}`}>
      <div className="glyph" aria-hidden="true">{glyph}</div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function Banner({ tone, children }: { tone: 'danger' | 'warn' | 'info' | 'ok'; children: ReactNode }) {
  return <div className={`banner banner-${tone}`} role={tone === 'danger' ? 'alert' : undefined}>{children}</div>;
}

export function CategoryBadge({ category }: { category: string | null | undefined }) {
  const style = categoryStyle(category);
  return (
    <div className="cat-badge" style={{ background: style.tint, color: style.color }} aria-hidden="true">
      {style.emoji}
    </div>
  );
}

export function CategoryPill({ category }: { category: string | null | undefined }) {
  const style = categoryStyle(category);
  return (
    <span className="pill" style={{ background: style.tint, color: style.color }}>
      {capitalize(category || 'other')}
    </span>
  );
}

export function Avatar({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const text = parts.length ? (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() : '?';
  return <span className="avatar" aria-hidden="true">{text}</span>;
}

export function Progress({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.min(Math.max(percent, 0), 100)}%`, background: color }} />
    </div>
  );
}

type TextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  error?: string;
  autoComplete?: string;
  placeholder?: string;
  readOnly?: boolean;
  id?: string;
  secret?: boolean;
};

export function TextField({ label, value, onChange, type = 'text', error, autoComplete, placeholder, readOnly, id, secret }: TextFieldProps) {
  const [shown, setShown] = useState(false);
  const fieldId = id ?? `f-${label.toLowerCase().replace(/\W+/g, '-')}`;
  const input = (
    <input
      id={fieldId}
      className={`input${error ? ' invalid' : ''}`}
      type={secret ? (shown ? 'text' : 'password') : type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete={autoComplete}
      placeholder={placeholder}
      readOnly={readOnly}
      aria-invalid={!!error}
      aria-describedby={error ? `${fieldId}-err` : undefined}
    />
  );
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      {secret ? (
        <div className="input-wrap">
          {input}
          <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? 'Hide password' : 'Show password'}>
            {shown ? 'Hide' : 'Show'}
          </button>
        </div>
      ) : (
        input
      )}
      {error && <span id={`${fieldId}-err`} className="field-error">{error}</span>}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        {children}
      </div>
    </div>
  );
}

// ── Toasts ─────────────────────────────────────────────────────
const ToastContext = createContext<(message: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const push = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div className="toast" key={t.id}>{t.message}</div>)}
      </div>
    </ToastContext.Provider>
  );
}
