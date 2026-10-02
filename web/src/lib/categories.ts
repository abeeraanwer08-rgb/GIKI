export const CATEGORIES = ['groceries', 'restaurant', 'utilities', 'transport', 'shopping', 'health', 'mobile', 'wallet', 'other'] as const;

type CategoryStyle = { color: string; tint: string; emoji: string };

const STYLES: Record<string, CategoryStyle> = {
  groceries: { color: '#0E7A4F', tint: '#E7F5EE', emoji: '🛒' },
  restaurant: { color: '#EA580C', tint: '#FFF1E7', emoji: '🍽️' },
  utilities: { color: '#D97706', tint: '#FEF6E4', emoji: '⚡' },
  wallet: { color: '#2563EB', tint: '#EEF4FF', emoji: '📱' },
  transport: { color: '#7C3AED', tint: '#F3EEFF', emoji: '🚗' },
  shopping: { color: '#DB2777', tint: '#FDEEF6', emoji: '🛍️' },
  health: { color: '#DC2626', tint: '#FEF2F2', emoji: '💊' },
  mobile: { color: '#0891B2', tint: '#E6F7FB', emoji: '📶' },
  other: { color: '#64748B', tint: '#F1F4F7', emoji: '•••' },
};

export function categoryStyle(category: string | null | undefined): CategoryStyle {
  return STYLES[(category ?? '').toLowerCase()] ?? STYLES.other;
}

export const DOCUMENT_LABELS: Record<string, string> = {
  receipt: 'Receipt',
  bank_statement: 'Bank statement',
  utility_bill: 'Utility bill',
  wallet_screenshot: 'Wallet transfer',
};

export function documentLabel(type: string | null | undefined): string {
  if (!type) return 'Document';
  return DOCUMENT_LABELS[type] ?? type.replace(/_/g, ' ');
}
