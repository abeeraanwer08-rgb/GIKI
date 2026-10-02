/** Date-range presets shared by the dashboard, transactions and insights. Inclusive YYYY-MM-DD, local time. */
export type PeriodKey = 'month' | 'last-month' | '30d' | '90d' | 'year' | 'all';
export type DateRange = { startDate?: string; endDate?: string };

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
];

export function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function rangeFor(period: PeriodKey, now: Date = new Date()): DateRange {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (period) {
    case 'month':
      return { startDate: isoDate(new Date(y, m, 1)) };
    case 'last-month':
      return { startDate: isoDate(new Date(y, m - 1, 1)), endDate: isoDate(new Date(y, m, 0)) };
    case '30d':
      return { startDate: isoDate(new Date(y, m, now.getDate() - 29)) };
    case '90d':
      return { startDate: isoDate(new Date(y, m, now.getDate() - 89)) };
    case 'year':
      return { startDate: isoDate(new Date(y, 0, 1)) };
    case 'all':
      return {};
  }
}
