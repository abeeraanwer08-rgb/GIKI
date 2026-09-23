export function formatMoney(
  amount: number | null | undefined,
  currency: string | null | undefined = 'PKR',
  { decimals = 0 }: { decimals?: number } = {},
): string {
  if (amount === null || amount === undefined) return '—';
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return currency ? `${currency} ${formatted}` : formatted;
}

function parseDate(date: string | null | undefined): Date | null {
  if (!date) return null;
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatShortDate(date: string | null | undefined): string {
  const parsed = parseDate(date);
  if (!parsed) return date || 'No date';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "Today", "Yesterday", or a long date label for grouping a transaction list. */
export function dayLabel(date: string | null | undefined, now: Date = new Date()): string {
  const parsed = parseDate(date);
  if (!parsed) return 'Undated';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today.getTime() - parsed.getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return parsed.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function isSameMonth(date: string | null | undefined, now: Date = new Date()): boolean {
  const parsed = parseDate(date);
  return (
    !!parsed &&
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth()
  );
}

export function greeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** "2026-09" → "September". */
export function monthName(month: string): string {
  const parsed = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return month;
  return parsed.toLocaleDateString('en-US', { month: 'long' });
}
