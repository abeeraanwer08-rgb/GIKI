import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Donut, Legend, MonthBars } from '../components/charts';
import { Button, CategoryBadge, EmptyState, Skeleton } from '../components/ui';
import { capitalize, formatDate, formatMoney, greeting } from '../lib/format';
import { useLoad } from '../lib/useLoad';

export default function Dashboard() {
  const { user } = useAuth();
  const summary = useLoad(() => api.summary(), []);
  const recent = useLoad(() => api.records({ limit: 6 }), []);
  const budgets = useLoad(() => api.budgets(), []);

  const s = summary.data;
  const currency = s?.currency ?? 'PKR';
  const forecast = s?.current_month ?? null;
  const categories = [...(s?.by_category ?? [])].sort((a, b) => b.total_amount - a.total_amount);
  const alerts = budgets.data?.budgets.filter((b) => b.status !== 'on_track') ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="faint">{greeting()}, {user?.name.trim().split(/\s+/)[0]}</span>
          <h1>Here’s your spending</h1>
        </div>
        <Link to="/app/add" className="btn btn-primary">➕ Add expense</Link>
      </div>

      {summary.error && !s ? (
        <div className="card"><EmptyState glyph="☁️" danger title="Couldn’t load your spending" body={summary.error} action={<Button onClick={summary.reload}>Try again</Button>} /></div>
      ) : (
        <div className="hero-card">
          <span className="overline" style={{ color: 'rgba(255,255,255,.7)', position: 'relative', zIndex: 1 }}>Spent this month</span>
          <div className="big num" style={{ position: 'relative', zIndex: 1 }}>
            {summary.loading && !s ? <Skeleton height={48} width={240} /> : formatMoney(forecast?.spent_to_date ?? 0, currency)}
          </div>
          {forecast && forecast.projected_total > 0 && (
            <span className="forecast-chip" style={{ position: 'relative', zIndex: 1 }}>
              📈 On pace for {formatMoney(forecast.projected_total, currency)} by month end
            </span>
          )}
          <div className="row">
            <div><small>All time</small><strong className="num">{s ? formatMoney(s.total_amount, currency) : '—'}</strong></div>
            <div><small>Records</small><strong className="num">{s ? s.record_count : '—'}</strong></div>
            <div><small>Days into month</small><strong className="num">{forecast ? `${forecast.days_elapsed} / ${forecast.days_in_month}` : '—'}</strong></div>
          </div>
        </div>
      )}

      {alerts.length > 0 && (
        <Link to="/app/budgets" className="banner banner-warn" style={{ textDecoration: 'none' }}>
          ⚠️ <span><b>{alerts.length} {alerts.length === 1 ? 'budget needs' : 'budgets need'} attention</b> — {alerts.map((b) => `${capitalize(b.category)} ${Math.round(b.percent_used)}%`).join(' · ')}</span>
        </Link>
      )}

      {s && s.record_count === 0 ? (
        <div className="card">
          <EmptyState title="No expenses yet" body="Add your first receipt or bank statement and HissabAI will fill in the merchant, items and total for you."
            action={<Link to="/app/add" className="btn btn-primary">Add your first expense</Link>} />
        </div>
      ) : (
        <>
          <div className="grid-2">
            <section className="card">
              <div className="card-title"><h3>Where your money goes</h3><span className="faint">All time</span></div>
              {summary.loading && !s ? <Skeleton height={200} /> : (
                <div className="donut-wrap">
                  <Donut data={categories} currency={currency} />
                  <Legend data={categories.slice(0, 6)} currency={currency} />
                </div>
              )}
            </section>
            <section className="card">
              <div className="card-title"><h3>By month</h3></div>
              {summary.loading && !s ? <Skeleton height={170} /> : <MonthBars data={s?.by_month ?? []} currency={currency} />}
            </section>
          </div>

          <section className="card">
            <div className="card-title"><h3>Recent activity</h3><Link to="/app/transactions">See all →</Link></div>
            {recent.loading && !recent.data ? (
              <div style={{ display: 'grid', gap: 14 }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={40} />)}</div>
            ) : (
              (recent.data?.records ?? []).map((r) => (
                <div className="txn" key={r.id}>
                  <CategoryBadge category={r.category} />
                  <div className="meta"><b>{r.merchant ?? 'Unknown'}</b><span className="faint" style={{ fontSize: 13 }}>{capitalize(r.category ?? 'other')} · {formatDate(r.transaction_date)}</span></div>
                  <span className="amt num">{formatMoney(r.amount, r.currency ?? currency)}</span>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
