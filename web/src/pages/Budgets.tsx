import { useState } from 'react';
import { api } from '../api/client';
import type { BudgetOverview, BudgetStatus } from '../api/types';
import { Button, CategoryBadge, EmptyState, Modal, Progress, Skeleton, TextField, useToast } from '../components/ui';
import { CATEGORIES, categoryStyle } from '../lib/categories';
import { capitalize, formatMoney, parseAmount } from '../lib/format';
import { useLoad } from '../lib/useLoad';

const TONE = {
  on_track: { label: 'On track', pill: 'pill-ok', color: '#0e7a4f' },
  warning: { label: 'Close to limit', pill: 'pill-warn', color: '#d97706' },
  over: { label: 'Over budget', pill: 'pill-bad', color: '#dc2626' },
} as const;

export default function Budgets() {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api.budgets(), []);
  const [overview, setOverview] = useState<BudgetOverview | null>(null);
  const [editing, setEditing] = useState<{ category: string; limit: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const current = overview ?? data;
  const used = new Set(current?.budgets.map((b) => b.category));
  const available = CATEGORIES.filter((c) => !used.has(c));

  const open = (b?: BudgetStatus) => {
    setFormError(null);
    setEditing({ category: b?.category ?? available[0] ?? 'groceries', limit: b ? String(b.monthly_limit) : '' });
  };

  const save = async () => {
    if (!editing) return;
    const limit = parseAmount(editing.limit);
    if (!limit || limit <= 0) {
      setFormError('Enter a monthly limit greater than zero.');
      return;
    }
    setBusy(true);
    try {
      setOverview(await api.setBudget(editing.category, limit));
      setEditing(null);
      toast(`${capitalize(editing.category)} budget saved`);
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (category: string) => {
    try {
      setOverview(await api.deleteBudget(category));
      setEditing(null);
      toast(`${capitalize(category)} budget removed`);
    } catch (e) {
      setFormError((e as Error).message);
    }
  };

  const isNew = editing ? !used.has(editing.category) : false;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="faint">{current ? `Spending in ${current.month}` : 'Monthly limits per category'}</span>
          <h1>Budgets</h1>
        </div>
        <Button onClick={() => open()} disabled={!available.length}>➕ New budget</Button>
      </div>

      {error && !current ? (
        <div className="card"><EmptyState glyph="☁️" danger title="Couldn’t load budgets" body={error} action={<Button onClick={reload}>Try again</Button>} /></div>
      ) : loading && !current ? (
        <div className="card" style={{ display: 'grid', gap: 18 }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={60} />)}</div>
      ) : current && current.budgets.length === 0 ? (
        <div className="card"><EmptyState glyph="🎯" title="No budgets yet" body="Set a monthly limit for a category and HissabAI will tell you when you’re getting close." action={<Button onClick={() => open()}>Create a budget</Button>} /></div>
      ) : current ? (
        <>
          <div className="grid-3">
            <div className="card stat"><span className="overline">Total budgeted</span><b className="num">{formatMoney(current.total_limit, current.currency)}</b></div>
            <div className="card stat"><span className="overline">Spent so far</span><b className="num">{formatMoney(current.total_spent, current.currency)}</b></div>
            <div className="card stat"><span className="overline">Needs attention</span><b className="num" style={{ color: current.alerts ? 'var(--warning)' : undefined }}>{current.alerts}</b></div>
          </div>
          <section className="card">
            {current.budgets.map((b) => {
              const tone = TONE[b.status];
              return (
                <div className="budget" key={b.category}>
                  <div className="budget-top">
                    <CategoryBadge category={b.category} />
                    <div className="grow"><b>{capitalize(b.category)}</b><div className="faint" style={{ fontSize: 13 }}>{formatMoney(b.spent, current.currency)} of {formatMoney(b.monthly_limit, current.currency)}</div></div>
                    <span className={`pill ${tone.pill}`}>{tone.label}</span>
                    <Button variant="ghost" small onClick={() => open(b)}>Edit</Button>
                  </div>
                  <Progress percent={b.percent_used} color={b.status === 'on_track' ? categoryStyle(b.category).color : tone.color} />
                  <div className="faint" style={{ fontSize: 13 }}>
                    {b.remaining >= 0 ? `${formatMoney(b.remaining, current.currency)} left` : `${formatMoney(-b.remaining, current.currency)} over`} · {Math.round(b.percent_used)}% used
                  </div>
                </div>
              );
            })}
          </section>
        </>
      ) : null}

      {editing && (
        <Modal title="Budget" onClose={() => setEditing(null)}>
          <form style={{ display: 'grid', gap: 16 }} onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <h2 style={{ fontSize: 24 }}>{isNew ? 'New budget' : `Edit ${capitalize(editing.category)} budget`}</h2>
            {isNew && (
              <div className="field">
                <span className="label">Category</span>
                <div className="chips" role="group" aria-label="Category">
                  {available.map((c) => (
                    <button type="button" key={c} className="chip" aria-pressed={editing.category === c} onClick={() => setEditing({ ...editing, category: c })}>
                      <span aria-hidden="true">{categoryStyle(c).emoji}</span>{capitalize(c)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <TextField label="Monthly limit (PKR)" value={editing.limit} onChange={(v) => setEditing({ ...editing, limit: v })} placeholder="10,000" error={formError ?? undefined} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
              {!isNew ? <Button type="button" variant="danger" onClick={() => remove(editing.category)}>Remove</Button> : <span />}
              <div style={{ display: 'flex', gap: 10 }}>
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                <Button type="submit" loading={busy}>Save budget</Button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
