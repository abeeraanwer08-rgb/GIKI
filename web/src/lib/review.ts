import type { ReviewResponse, SavePayload } from '../api/types';
import { formatMoney, parseAmount, parseCurrency } from './format';

export type DraftItem = {
  description: string;
  amount: string;
  category: string | null;
  metadata: Record<string, unknown>;
};

/** Everything the review form edits, built from the upload response. */
export type Draft = {
  documentType: string;
  merchant: string;
  date: string;
  currency: string;
  total: string;
  items: DraftItem[];
  hints: string[];
  confidence: number | null;
  source: string;
  details: Record<string, unknown> | undefined;
  extras: { service_charge: number | null; tax_amount: number | null; delivery_charge: number | null; discount_amount: number | null; subtotal_amount: number | null };
};

const text = (value: unknown): string => (value === null || value === undefined ? '' : String(value));
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export function isStatement(documentType: string): boolean {
  return documentType === 'bank_statement';
}

export function isInvoice(documentType: string): boolean {
  return documentType === 'invoice';
}

export function buildDraft(response: ReviewResponse): Draft {
  const fields = response.editable_fields ?? {};
  const meta = response.processing_metadata ?? {};
  const currency = text(fields.currency?.value) || 'PKR';
  const total = num(fields.total_amount?.value);
  const hints = [
    ...(response.review_hints ?? []).map((h) => h.message),
    ...(response.validation_warnings ?? []),
  ].filter((hint, i, all) => hint && all.indexOf(hint) === i);

  return {
    documentType: response.document_type,
    merchant: text(fields.merchant?.value),
    date: text(fields.purchase_date?.value),
    currency,
    total: total === null ? '' : formatMoney(total, currency, 2).replace(/\.00$/, ''),
    items: (response.extracted_items ?? []).map((item) => ({
      description: item.description,
      amount: item.amount === null || item.amount === undefined ? '' : String(item.amount),
      category: item.category ?? null,
      metadata: item.metadata ?? {},
    })),
    hints,
    confidence: response.overall_confidence,
    source: text(meta.source) || 'receipt_analysis',
    details: (meta.details as Record<string, unknown> | undefined) ?? undefined,
    extras: {
      service_charge: num(meta.service_charge),
      tax_amount: num(meta.tax_amount),
      delivery_charge: num(meta.delivery_charge),
      discount_amount: num(meta.discount_amount),
      subtotal_amount: num(meta.subtotal_amount),
    },
  };
}

/** Sum of the item amounts, rounded to paisa, formatted like the total field. */
export function sumItems(items: DraftItem[], currency: string): string {
  const sum = items.reduce((acc, item) => acc + (parseAmount(item.amount) ?? 0), 0);
  return formatMoney(Math.round(sum * 100) / 100, currency, 2).replace(/\.00$/, '');
}

export function buildPayload(
  draft: Draft,
  recordId: string,
  category: string | null,
  confirmTotalMismatch: boolean,
): SavePayload {
  const statement = isStatement(draft.documentType);
  // A statement's total is always the sum of the rows kept, whatever the field says.
  const total = statement ? sumItems(draft.items, draft.currency) : draft.total;
  return {
    record_id: recordId,
    document_type: draft.documentType,
    merchant: draft.merchant.trim() || null,
    document_date: draft.date.trim() || null,
    currency: parseCurrency(total) ?? (draft.currency || null),
    total_amount: parseAmount(total),
    payment_method: null,
    category: statement ? null : category,
    items: draft.items.map((item) => ({
      description: item.description,
      amount: parseAmount(item.amount),
      quantity: null,
      unit_price: null,
      category: item.category,
      metadata: item.metadata,
    })),
    metadata: {
      source: draft.source,
      parser_version: 'web-review-v1',
      confidence: null,
      confidence_level: null,
      review_required: null,
      review_hints: draft.hints.map((message) => ({ field: 'general', message })),
      quality_score: null,
      ...draft.extras,
      details: draft.details,
      confirm_total_mismatch: confirmTotalMismatch || undefined,
    },
  };
}
