import { categoryStyle } from '../lib/categories';
import { capitalize, formatMoney } from '../lib/format';
import type { CategoryTotal, MonthlyTotal } from '../api/types';

export function Donut({ data, currency, size = 200 }: { data: CategoryTotal[]; currency: string; size?: number }) {
  const total = data.reduce((sum, d) => sum + d.total_amount, 0);
  const r = size / 2 - 16;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Spending by category, total ${formatMoney(total, currency)}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f4f7" strokeWidth={22} />
      {total > 0 &&
        data.map((d) => {
          const length = (d.total_amount / total) * c;
          const gap = data.length > 1 ? 3 : 0;
          const el = (
            <circle
              key={d.category}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={categoryStyle(d.category).color}
              strokeWidth={22}
              strokeDasharray={`${Math.max(length - gap, 0)} ${c}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += length;
          return el;
        })}
      <text x="50%" y="46%" textAnchor="middle" fontSize="11" fontWeight="650" fill="#94a3b8" letterSpacing="1.2">
        TOTAL {currency}
      </text>
      <text x="50%" y="58%" textAnchor="middle" fontSize="24" fontWeight="800" fill="#0f172a">
        {total.toLocaleString('en-US', { maximumFractionDigits: 0 })}
      </text>
    </svg>
  );
}

export function Legend({ data, currency }: { data: CategoryTotal[]; currency: string }) {
  const total = data.reduce((s, d) => s + d.total_amount, 0);
  return (
    <div className="legend">
      {data.map((d) => (
        <div className="legend-row" key={d.category}>
          <span className="dot" style={{ background: categoryStyle(d.category).color }} />
          <span>{capitalize(d.category)}</span>
          <span className="faint num">{total ? Math.round((d.total_amount / total) * 100) : 0}%</span>
          <span className="amt num">{formatMoney(d.total_amount, currency)}</span>
        </div>
      ))}
    </div>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function MonthBars({ data, currency }: { data: MonthlyTotal[]; currency: string }) {
  const recent = data.slice(-6);
  const max = Math.max(...recent.map((m) => m.total_amount), 1);
  return (
    <div className="bars" role="img" aria-label="Spending by month">
      {recent.map((m) => (
        <div className="col" key={m.month} title={`${m.month}: ${formatMoney(m.total_amount, currency)}`}>
          <b className="num">{m.total_amount >= 1000 ? `${Math.round(m.total_amount / 1000)}k` : Math.round(m.total_amount)}</b>
          <div className="bar" style={{ height: Math.max(Math.round((m.total_amount / max) * 130), 4) }} />
          <span>{MONTHS[Number(m.month.slice(5, 7)) - 1] ?? m.month}</span>
        </div>
      ))}
    </div>
  );
}
