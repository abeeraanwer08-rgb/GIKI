import { Ionicons } from '@expo/vector-icons';

export type CategoryStyle = {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  tint: string;
  /** Brighter variant that stays legible on the dark brand gradient. */
  onDark: string;
};

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  groceries: { icon: 'cart', color: '#0E7A4F', tint: '#E7F5EE', onDark: '#6EE7B7' },
  restaurant: { icon: 'restaurant', color: '#EA580C', tint: '#FFF1E7', onDark: '#FDBA74' },
  food: { icon: 'fast-food', color: '#EA580C', tint: '#FFF1E7', onDark: '#FDBA74' },
  utilities: { icon: 'flash', color: '#D97706', tint: '#FEF6E4', onDark: '#FCD34D' },
  wallet: { icon: 'phone-portrait', color: '#2563EB', tint: '#EEF4FF', onDark: '#93C5FD' },
  transport: { icon: 'car', color: '#7C3AED', tint: '#F3EEFF', onDark: '#C4B5FD' },
  shopping: { icon: 'bag-handle', color: '#DB2777', tint: '#FDEEF6', onDark: '#F9A8D4' },
  health: { icon: 'medkit', color: '#DC2626', tint: '#FEF2F2', onDark: '#FCA5A5' },
  mobile: { icon: 'cellular', color: '#0891B2', tint: '#E6F7FB', onDark: '#67E8F9' },
  other: { icon: 'ellipsis-horizontal', color: '#64748B', tint: '#F1F4F7', onDark: '#CBD5E1' },
};

/** Categories the backend understands (mirrors services/categorization.py). */
export const CATEGORIES = [
  'groceries',
  'restaurant',
  'utilities',
  'transport',
  'shopping',
  'health',
  'mobile',
  'wallet',
  'other',
] as const;

const DOCUMENT_TYPE_STYLES: Record<string, CategoryStyle> = {
  receipt: { icon: 'receipt', color: '#0E7A4F', tint: '#E7F5EE', onDark: '#6EE7B7' },
  utility_bill: { icon: 'flash', color: '#D97706', tint: '#FEF6E4', onDark: '#FCD34D' },
  wallet_screenshot: { icon: 'phone-portrait', color: '#2563EB', tint: '#EEF4FF', onDark: '#93C5FD' },
  invoice: { icon: 'document-text', color: '#0891B2', tint: '#E6F7FB', onDark: '#67E8F9' },
  bank_statement: { icon: 'business', color: '#2563EB', tint: '#EEF4FF', onDark: '#93C5FD' },
};

const DEFAULT_STYLE: CategoryStyle = { icon: 'card', color: '#64748B', tint: '#F1F4F7', onDark: '#CBD5E1' };

export function getCategoryStyle(
  category: string | null | undefined,
  documentType?: string | null,
): CategoryStyle {
  const key = category?.toLowerCase();
  if (key && CATEGORY_STYLES[key]) return CATEGORY_STYLES[key];
  if (documentType && DOCUMENT_TYPE_STYLES[documentType]) return DOCUMENT_TYPE_STYLES[documentType];
  return DEFAULT_STYLE;
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  receipt: 'Receipt',
  utility_bill: 'Utility bill',
  wallet_screenshot: 'Wallet transfer',
  bank_statement: 'Bank statement',
  invoice: 'Invoice',
};

export function documentTypeLabel(documentType: string | null | undefined): string {
  if (!documentType) return 'Document';
  return DOCUMENT_TYPE_LABELS[documentType] ?? documentType.replace(/_/g, ' ');
}
