import { Ionicons } from '@expo/vector-icons';

/** What the user says they are scanning. 'auto' lets the server decide. */
export type ScanDocumentType =
  | 'auto'
  | 'receipt'
  | 'bank_statement'
  | 'invoice'
  | 'utility_bill'
  | 'wallet_screenshot';

export type ScanTypeOption = {
  key: ScanDocumentType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** One line shown under the picker once selected. */
  hint: string;
};

export const SCAN_TYPES: ScanTypeOption[] = [
  { key: 'auto', label: 'Auto-detect', icon: 'sparkles', hint: 'HissabAI works out what the document is.' },
  { key: 'receipt', label: 'Receipt', icon: 'receipt', hint: 'Shop, restaurant or fuel receipt.' },
  {
    key: 'bank_statement',
    label: 'Bank statement',
    icon: 'business',
    hint: 'A photo or PDF; several pages are fine. Every spending row becomes its own expense.',
  },
  {
    key: 'invoice',
    label: 'Invoice',
    icon: 'document-text',
    hint: 'A business invoice with line items, tax and a total. Several pages are fine.',
  },
  { key: 'utility_bill', label: 'Utility bill', icon: 'flash', hint: 'Electricity, gas, water or internet bill.' },
  { key: 'wallet_screenshot', label: 'Wallet', icon: 'wallet', hint: 'EasyPaisa or JazzCash transaction screenshot.' },
];

export function scanTypeLabel(key: ScanDocumentType | undefined): string {
  return SCAN_TYPES.find((t) => t.key === key)?.label ?? 'Document';
}

/** Types whose documents may span several pages (photos or a multi-page PDF). */
export const MULTI_PAGE_TYPES: ScanDocumentType[] = ['bank_statement', 'invoice'];

/** The most pages the server accepts in one document. */
export const MAX_PAGES = 12;
