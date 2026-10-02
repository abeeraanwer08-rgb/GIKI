/** Date-range presets shared by Insights. Dates are inclusive YYYY-MM-DD in local time. */
export type PeriodKey = 'month' | '30d' | '90d' | 'all';

export type DateRange = { startDate?: string; endDate?: string };

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'month', label: 'Month' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
  { key: 'all', label: 'All time' },
];

function iso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function rangeFor(period: PeriodKey, now: Date = new Date()): DateRange {
  switch (period) {
    case 'month':
      return { startDate: iso(new Date(now.getFullYear(), now.getMonth(), 1)) };
    case '30d':
    case '90d': {
      const days = period === '30d' ? 29 : 89; // inclusive of today
      return { startDate: iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days)) };
    }
    case 'all':
      return {};
  }
}

export function periodLabel(period: PeriodKey): string {
  return PERIODS.find((p) => p.key === period)?.label ?? '';
}
