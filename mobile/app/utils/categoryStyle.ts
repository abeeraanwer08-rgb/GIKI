import { Ionicons } from '@expo/vector-icons';

export type CategoryStyle = {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  tint: string;
};

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  groceries: { icon: 'cart', color: '#1B5E3B', tint: '#E3F3E9' },
  restaurant: { icon: 'restaurant', color: '#D9782A', tint: '#FBEBDD' },
  utilities: { icon: 'flash', color: '#B8860B', tint: '#FBF2DA' },
  wallet: { icon: 'phone-portrait', color: '#2E6DB4', tint: '#E4EEFA' },
};

const DOCUMENT_TYPE_STYLES: Record<string, CategoryStyle> = {
  receipt: { icon: 'receipt', color: '#1B5E3B', tint: '#E3F3E9' },
  utility_bill: { icon: 'flash', color: '#B8860B', tint: '#FBF2DA' },
  wallet_screenshot: { icon: 'phone-portrait', color: '#2E6DB4', tint: '#E4EEFA' },
};

const DEFAULT_STYLE: CategoryStyle = { icon: 'card', color: '#6B7785', tint: '#EAEDF0' };

export function getCategoryStyle(
  category: string | null | undefined,
  documentType?: string | null,
): CategoryStyle {
  if (category && CATEGORY_STYLES[category.toLowerCase()]) {
    return CATEGORY_STYLES[category.toLowerCase()];
  }
  if (documentType && DOCUMENT_TYPE_STYLES[documentType]) {
    return DOCUMENT_TYPE_STYLES[documentType];
  }
  return DEFAULT_STYLE;
}
