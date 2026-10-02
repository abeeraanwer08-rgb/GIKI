import { describe, expect, it } from 'vitest';
import type { ReviewResponse } from '../api/types';
import { capitalize, formatMoney, initials, parseAmount, parseCurrency } from './format';
import { isoDate, rangeFor } from './period';
import { buildDraft, buildPayload, sumItems } from './review';

describe('format', () => {
  it('formats money and tolerates missing values', () => {
    expect(formatMoney(12345.5, 'PKR', 2)).toBe('PKR 12,345.50');
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(5, null)).toBe('5');
  });
  it('parses amounts and currency codes out of display strings', () => {
    expect(parseAmount('PKR 12,345.5')).toBe(12345.5);
    expect(parseAmount('abc')).toBeNull();
    expect(parseCurrency('PKR 100')).toBe('PKR');
    expect(parseCurrency('100')).toBeNull();
  });
  it('builds initials and capitalises', () => {
    expect(initials('Ali Raza Khan')).toBe('AK');
    expect(initials('  ')).toBe('?');
    expect(capitalize('groceries')).toBe('Groceries');
  });
});

describe('period ranges', () => {
  const now = new Date(2026, 8, 23); // 23 Sep 2026
  it('covers this month, last month and rolling windows inclusively', () => {
    expect(rangeFor('month', now)).toEqual({ startDate: '2026-09-01' });
    expect(rangeFor('last-month', now)).toEqual({ startDate: '2026-08-01', endDate: '2026-08-31' });
    expect(rangeFor('30d', now)).toEqual({ startDate: '2026-08-25' });
    expect(rangeFor('90d', now)).toEqual({ startDate: '2026-06-26' });
    expect(rangeFor('year', now)).toEqual({ startDate: '2026-01-01' });
    expect(rangeFor('all', now)).toEqual({});
  });
  it('handles January for last month', () => {
    expect(rangeFor('last-month', new Date(2026, 0, 10))).toEqual({ startDate: '2025-12-01', endDate: '2025-12-31' });
    expect(isoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

const statement: ReviewResponse = {
  document_type: 'bank_statement',
  editable_fields: {
    merchant: { value: 'HBL' }, purchase_date: { value: '2026-09-30' }, currency: { value: 'PKR' }, total_amount: { value: 5300 },
  },
  extracted_items: [
    { description: 'Imtiaz', amount: 3450, category: 'groceries', metadata: { date: '2026-09-05' } },
    { description: 'Cafe Flo', amount: 1850, category: 'restaurant', metadata: { date: '2026-09-09' } },
  ],
  validation_warnings: ['Check row 2'],
  review_hints: [{ field: 'x', message: 'Check row 2' }, { field: 'y', message: 'Another hint' }],
  overall_confidence: 0.9,
  processing_metadata: { source: 'bank_statement_analysis', details: { period_start: '2026-09-01' } },
};

describe('review draft and payload', () => {
  it('builds a draft with de-duplicated hints and carries row facts through', () => {
    const draft = buildDraft(statement);
    expect(draft.hints).toEqual(['Check row 2', 'Another hint']);
    expect(draft.total).toBe('PKR 5,300');
    expect(draft.items[0]).toMatchObject({ category: 'groceries', metadata: { date: '2026-09-05' } });
  });

  it('recomputes a statement total from the rows kept and never sends a stale one', () => {
    const draft = buildDraft(statement);
    draft.items.pop();
    expect(sumItems(draft.items, 'PKR')).toBe('PKR 3,450');
    const payload = buildPayload(draft, 'id-1', 'groceries', false);
    expect(payload.total_amount).toBe(3450);
    expect(payload.category).toBeNull(); // statements are categorised row by row
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].metadata).toEqual({ date: '2026-09-05' });
    expect(payload.metadata.source).toBe('bank_statement_analysis');
    expect(payload.metadata.details).toEqual({ period_start: '2026-09-01' });
  });

  it('keeps the user-chosen category and the edited total for a receipt', () => {
    const draft = buildDraft({ ...statement, document_type: 'receipt', processing_metadata: {} });
    draft.total = 'PKR 999';
    const payload = buildPayload(draft, 'id-2', 'shopping', true);
    expect(payload.total_amount).toBe(999);
    expect(payload.category).toBe('shopping');
    expect(payload.metadata.confirm_total_mismatch).toBe(true);
    expect(payload.metadata.source).toBe('receipt_analysis');
  });
});

describe('statement row dates', () => {
  it('sends the date the user typed and keeps invoice charges in the payload', () => {
    const draft = buildDraft({
      document_type: 'bank_statement',
      editable_fields: { merchant: { value: 'HBL' }, purchase_date: { value: '2026-09-30' }, currency: { value: 'PKR' }, total_amount: { value: 100 } },
      extracted_items: [{ description: 'A', amount: 100, category: 'other', metadata: { date: '', date_inferred: true } }],
      validation_warnings: [], review_hints: [], overall_confidence: 0.9, processing_metadata: { source: 'bank_statement_analysis' },
    });
    draft.items[0].metadata = { ...draft.items[0].metadata, date: '2026-09-12', date_inferred: undefined };
    const payload = buildPayload(draft, 'id', null, false);
    expect(payload.items[0].metadata.date).toBe('2026-09-12');
  });

  it('carries invoice tax, shipping and discount through unchanged', () => {
    const draft = buildDraft({
      document_type: 'invoice',
      editable_fields: { merchant: { value: 'Alpha' }, purchase_date: { value: '2026-09-10' }, currency: { value: 'PKR' }, total_amount: { value: 1500 } },
      extracted_items: [{ description: 'Chair', amount: 1250 }],
      validation_warnings: [], review_hints: [], overall_confidence: 0.9,
      processing_metadata: { source: 'invoice_analysis', tax_amount: 225, delivery_charge: 100, discount_amount: 75, subtotal_amount: 1250, details: { invoice_number: 'INV-1' } },
    });
    const payload = buildPayload(draft, 'id', 'shopping', false);
    expect(payload.metadata).toMatchObject({ tax_amount: 225, delivery_charge: 100, discount_amount: 75, subtotal_amount: 1250, source: 'invoice_analysis' });
    expect(payload.category).toBe('shopping');
  });
});
