export function formatMoney(amount: number | null | undefined, currency: string | null | undefined = 'PKR', decimals = 0): string {
  if (amount === null || amount === undefined) return '—';
  const text = amount.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return currency ? `${currency} ${text}` : text;
}

export function parseIsoDate(date: string | null | undefined): Date | null {
  if (!date) return null;
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(date: string | null | undefined): string {
  const parsed = parseIsoDate(date);
  if (!parsed) return date || 'No date';
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function greeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** "PKR 12,345.5" or "12,345.5" → 12345.5. Returns null when there are no digits. */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const value = parseFloat(cleaned);
  return Number.isNaN(value) ? null : value;
}

export function parseCurrency(text: string): string | null {
  const match = text.match(/\b([A-Z]{2,4})\b/);
  return match ? match[1] : null;
}
