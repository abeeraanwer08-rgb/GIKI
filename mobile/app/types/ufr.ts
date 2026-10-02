export interface UFRItem {
  name: string;
  amount: string;
  /** Set by the server for bank-statement rows; passed back unchanged on save. */
  category?: string | null;
  /** Row facts such as the transaction date; passed back unchanged on save. */
  metadata?: Record<string, unknown>;
}

export interface UniversalFinancialRecord {
  documentType: string;
  merchant: string;
  date: string;
  total: string;
  items: UFRItem[];
  confidence: string;
  reviewHints: string[];
  serviceCharge?: string;
  taxAmount?: string;
  deliveryCharge?: string;
  discountAmount?: string;
  subtotalAmount?: string;
  /** Where the data came from (e.g. 'bank_statement_analysis'). */
  source?: string;
  /** Document-specific facts, e.g. a bank statement's period, balances and credit totals. */
  details?: Record<string, unknown>;
}
