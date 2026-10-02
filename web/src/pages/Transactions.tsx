import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { RecordSummary } from '../api/types';
import { Button, CategoryBadge, CategoryPill, EmptyState, Skeleton } from '../components/ui';
import { CATEGORIES } from '../lib/categories';
import { capitalize, formatDate, formatMoney } from '../lib/format';
import { PERIODS, rangeFor, type PeriodKey } from '../lib/period';

const PAGE = 25;

export default function Transactions() {
  const [period, setPeriod] = useState<PeriodKey>('all');
  const [category, setCategory] = useState<string>('');
  const [rows, setRows] = useState<RecordSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0);

  const fetchPage = useCallback(async (offset: number) => {
    return api.records({ limit: PAGE, offset, category: category || null, ...rangeFor(period) });
  }, [period, category]);

  const reload = useCallback(() => {
    const id = ++run.current;
    setLoading(true);
    setError(null);
    fetchPage(0).then(
      (page) => {
        if (id !== run.current) return;
        setRows(page.records);
        setTotal(page.total);
        setHasMore(page.has_more);
        setLoading(false);
      },
      (e: Error) => {
        if (id !== run.current) return;
        setError(e.message);
        setLoading(false);
      },
    );
  }, [fetchPage]);

  useEffect(reload, [reload]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = await fetchPage(rows.length);
      setRows((r) => [...r, ...page.records]);
      setTotal(page.total);
      setHasMore(page.has_more);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  const shownTotal = rows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const currency = rows.find((r) => r.currency)?.currency ?? 'PKR';

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="faint">{loading ? 'Loading…' : `${total} transaction${total === 1 ? '' : 's'}`}</span>
          <h1>Transactions</h1>
        </div>
        <Link to="/app/add" className="btn btn-primary">➕ Add expense</Link>
      </div>

      <div className="toolbar" role="group" aria-label="Filters">
        <div className="chips" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p.key} className="chip" aria-pressed={p.key === period} onClick={() => setPeriod(p.key)}>{p.label}</button>
          ))}
        </div>
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{capitalize(c)}</option>)}
        </select>
      </div>

      <section className="card">
        {error && !rows.length ? (
          <EmptyState glyph="☁️" danger title="Couldn’t load transactions" body={error} action={<Button onClick={reload}>Try again</Button>} />
        ) : loading ? (
          <div style={{ display: 'grid', gap: 14 }}>{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={44} />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState title="Nothing here" body={period === 'all' && !category ? 'Add a receipt or bank statement to get started.' : 'No transactions match these filters. Try a wider range.'} />
        ) : (
          <>
            {rows.map((r) => (
              <div className="txn" key={r.id}>
                <CategoryBadge category={r.category} />
                <div className="meta">
                  <b>{r.merchant ?? 'Unknown'}</b>
                  <span className="faint" style={{ fontSize: 13 }}>{formatDate(r.transaction_date)}</span>
                </div>
                <CategoryPill category={r.category} />
                <span className="amt num" style={{ minWidth: 110, textAlign: 'right' }}>{formatMoney(r.amount, r.currency ?? currency)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingTop: 16, flexWrap: 'wrap' }}>
              <span className="muted">Showing {rows.length} of {total} · {formatMoney(shownTotal, currency)}</span>
              {hasMore && <Button variant="secondary" small loading={loadingMore} onClick={loadMore}>Load more</Button>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
