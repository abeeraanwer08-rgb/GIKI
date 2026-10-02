import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Donut, Legend, MonthBars } from '../components/charts';
import { Button, CategoryBadge, EmptyState, Skeleton } from '../components/ui';
import { capitalize, formatDate, formatMoney } from '../lib/format';
import { PERIODS, rangeFor, type PeriodKey } from '../lib/period';
import { useLoad } from '../lib/useLoad';

export default function Insights() {
  const [period, setPeriod] = useState<PeriodKey>('all');
  const { data, error, loading, reload } = useLoad(() => api.insights(rangeFor(period)), [period]);

  const summary = data?.summary;
  const currency = summary?.currency ?? 'PKR';
  const categories = [...(summary?.by_category ?? [])].sort((a, b) => b.total_amount - a.total_amount);
  const forecast = summary?.current_month;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="overline" style={{ color: 'var(--primary)' }}>AI copilot</span>
          <h1>Insights</h1>
        </div>
        <Button variant="ghost" small onClick={reload}>↻ Refresh</Button>
      </div>

      <div className="chips" role="group" aria-label="Period">
        {PERIODS.map((p) => (
          <button key={p.key} className="chip" aria-pressed={p.key === period} onClick={() => setPeriod(p.key)}>{p.label}</button>
        ))}
      </div>

      {error && !data ? (
        <div className="card"><EmptyState glyph="☁️" danger title="Couldn’t load insights" body={error} action={<Button onClick={reload}>Try again</Button>} /></div>
      ) : loading && !data ? (
        <div style={{ display: 'grid', gap: 16 }}><Skeleton height={130} radius={26} /><Skeleton height={260} radius={22} /></div>
      ) : summary && summary.record_count === 0 ? (
        <div className="card"><EmptyState glyph="✨" title="No insights yet" body={period === 'all' ? 'Save a few expenses first — insights are generated from your saved records.' : 'No expenses in this period. Try a longer range.'} action={<Link to="/app/add" className="btn btn-primary">Add expense</Link>} /></div>
      ) : data && summary ? (
        <div style={{ display: 'grid', gap: 22, opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
          <div className="insight-hero">
            <span className="overline" style={{ color: 'rgba(255,255,255,.7)' }}>✨ AI summary</span>
            <h2>{data.headline}</h2>
          </div>

          <div className="grid-3">
            <div className="card stat"><span className="overline">Total spent</span><b className="num">{formatMoney(summary.total_amount, currency)}</b></div>
            <div className="card stat"><span className="overline">Transactions</span><b className="num">{summary.record_count}</b></div>
            <div className="card stat"><span className="overline">Average</span><b className="num">{formatMoney(summary.record_count ? summary.total_amount / summary.record_count : 0, currency)}</b></div>
          </div>

          {forecast && (
            <div className="card">
              <div className="card-title"><h3>📈 {forecast.month} forecast</h3><span className="faint">{forecast.days_elapsed} of {forecast.days_in_month} days</span></div>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em' }}>On pace for {formatMoney(forecast.projected_total, currency)}</div>
              <div className="progress" style={{ margin: '12px 0 8px' }}><span style={{ width: `${(forecast.days_elapsed / forecast.days_in_month) * 100}%`, background: '#2563eb' }} /></div>
              <span className="muted">{formatMoney(forecast.spent_to_date, currency)} spent so far this month</span>
            </div>
          )}

          <div className="grid-2">
            <section className="card">
              <div className="card-title"><h3>Where your money goes</h3></div>
              <div className="donut-wrap"><Donut data={categories} currency={currency} /><Legend data={categories} currency={currency} /></div>
            </section>
            <section className="card">
              <div className="card-title"><h3>By month</h3></div>
              <MonthBars data={summary.by_month} currency={currency} />
            </section>
          </div>

          <div className="grid-2">
            <section className="card">
              <div className="card-title"><h3>What stands out</h3></div>
              <ul className="bullets">{data.insights.map((t) => <li key={t}>{t}</li>)}</ul>
            </section>
            <section className="card">
              <div className="card-title"><h3>Suggestions</h3></div>
              <ul className="bullets rec">{data.recommendations.map((t) => <li key={t}>{t}</li>)}</ul>
            </section>
          </div>

          {summary.anomalies.length > 0 && (
            <section className="card">
              <div className="card-title"><h3>⚠️ Unusual spending</h3><span className="faint">At least 2× the usual for the category</span></div>
              {summary.anomalies.map((a, i) => (
                <div className="txn" key={a.record_id ?? i}>
                  <CategoryBadge category={a.category} />
                  <div className="meta"><b>{a.merchant ?? 'Unknown'}</b><span className="faint" style={{ fontSize: 13 }}>{capitalize(a.category)} · {formatDate(a.transaction_date)} · usually {formatMoney(a.typical_amount, currency)}</span></div>
                  <span className="pill pill-warn">{a.ratio}×</span>
                  <span className="amt num">{formatMoney(a.amount, currency)}</span>
                </div>
              ))}
            </section>
          )}

          {summary.top_merchants.length > 0 && (
            <section className="card">
              <div className="card-title"><h3>Top merchants</h3></div>
              {summary.top_merchants.map((m) => (
                <div className="txn" key={m.category}>
                  <div className="meta"><b>{m.category}</b><span className="faint" style={{ fontSize: 13 }}>{m.record_count} transaction{m.record_count === 1 ? '' : 's'}</span></div>
                  <span className="amt num">{formatMoney(m.total_amount, currency)}</span>
                </div>
              ))}
            </section>
          )}
        </div>
      ) : null}
    </div>
  );
}
