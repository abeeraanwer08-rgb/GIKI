import { UniversalFinancialRecord } from '../types/ufr';
import { API_BASE_URL } from '../config/api';
import { authHeaders, notifyIfUnauthorized } from '../auth/session';

interface EditableFieldResponse {
  value?: unknown;
}

interface ReviewResponseItem {
  description: string;
  amount?: number | null;
}

interface ReviewHintResponse {
  field: string;
  message: string;
}

interface UploadReviewResponse {
  document_type: string;
  editable_fields: Record<string, EditableFieldResponse>;
  extracted_items: ReviewResponseItem[];
  validation_warnings: string[];
  review_hints: ReviewHintResponse[];
  overall_confidence: number | null;
  processing_metadata: Record<string, unknown>;
  receipt?: {
    merchant_name?: string | null;
    purchase_date?: string | null;
    currency?: string | null;
    total_amount?: number | null;
    service_charge?: number | null;
  } | null;
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatAmount(amount: number | null | undefined, currency: string): string {
  if (amount === null || amount === undefined) return '';
  const formatted = amount.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
  return currency ? `${currency} ${formatted}` : formatted;
}

function toUniversalFinancialRecord(
  response: UploadReviewResponse,
): UniversalFinancialRecord {
  const fields = response.editable_fields ?? {};
  const receipt = response.receipt;
  const currency =
    asText(fields.currency?.value) || receipt?.currency || '';
  const merchant =
    asText(fields.merchant?.value) || receipt?.merchant_name || '';
  const date =
    asText(fields.purchase_date?.value) || receipt?.purchase_date || '';
  const totalAmount = fields.total_amount?.value ?? receipt?.total_amount;

  const meta = response.processing_metadata ?? {};

  const serviceCharge =
    asNumber(meta.service_charge) ?? receipt?.service_charge ?? null;
  const taxAmount = asNumber(meta.tax_amount) ?? null;
  const deliveryCharge = asNumber(meta.delivery_charge) ?? null;
  const discountAmount = asNumber(meta.discount_amount) ?? null;
  const subtotalAmount = asNumber(meta.subtotal_amount) ?? null;

  const confidenceLevel = asText(meta.confidence_level);
  const hints = [
    ...(response.review_hints ?? []).map((hint) => hint.message),
    ...(response.validation_warnings ?? []),
  ].filter((hint, index, all) => hint && all.indexOf(hint) === index);

  return {
    documentType: response.document_type,
    merchant,
    date,
    total: formatAmount(
      typeof totalAmount === 'number' ? totalAmount : null,
      currency,
    ),
    items: (response.extracted_items ?? []).map((item) => ({
      name: item.description,
      amount: formatAmount(item.amount, currency),
    })),
    serviceCharge:
      serviceCharge === null ? undefined : formatAmount(serviceCharge, currency),
    taxAmount:
      taxAmount === null ? undefined : formatAmount(taxAmount, currency),
    deliveryCharge:
      deliveryCharge === null ? undefined : formatAmount(deliveryCharge, currency),
    discountAmount:
      discountAmount === null ? undefined : formatAmount(discountAmount, currency),
    subtotalAmount:
      subtotalAmount === null ? undefined : formatAmount(subtotalAmount, currency),
    confidence:
      confidenceLevel.toUpperCase() ||
      (response.overall_confidence === null ||
      response.overall_confidence === undefined
        ? ''
        : `${Math.round(response.overall_confidence * 100)}%`),
    reviewHints: hints,
  };
}

function getUploadFileName(uri: string): string {
  const name = uri.split('/').pop()?.split('?')[0];
  return name || 'document.jpg';
}

function getUploadMimeType(uri: string): string {
  const extension = uri.split('?')[0].split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    tif: 'image/tiff',
    tiff: 'image/tiff',
  };
  return (extension && mimeTypes[extension]) || 'image/jpeg';
}

/** A failed scan, carrying a message that is safe and useful to show the user. */
export class UploadError extends Error {
  constructor(
    public readonly status: number | null,
    public readonly userMessage: string,
    /** Retaking the photo can fix it (blur, wrong document) — as opposed to a server/network problem. */
    public readonly retakeHelps: boolean,
  ) {
    super(userMessage);
  }
}

function uploadErrorFor(status: number, body: unknown): UploadError {
  const detail = (body as { detail?: { status?: string } } | null)?.detail;
  if (status === 401) {
    return new UploadError(status, 'Your session has expired. Please sign in again.', false);
  }
  if (status === 413) {
    return new UploadError(status, 'That photo is too large. Choose one under 10 MB, or retake it.', true);
  }
  if (status === 415) {
    return new UploadError(status, 'That file type isn’t supported. Use a JPEG or PNG photo.', true);
  }
  if (status === 400 && detail?.status === 'unsupported_document') {
    return new UploadError(status, 'This doesn’t look like a receipt, bill or wallet screenshot.', true);
  }
  if (status === 400) {
    return new UploadError(status, 'The photo is too blurry or dark to read. Try again in better light.', true);
  }
  return new UploadError(status, 'Something went wrong on our side. Please try again in a moment.', false);
}

export async function uploadDocument(
  imageUris: string[],
): Promise<UniversalFinancialRecord> {
  const imageUri = imageUris[0];
  if (!imageUri) {
    throw new UploadError(null, 'No document image was selected.', true);
  }

  const formData = new FormData();
  formData.append(
    'file',
    {
      uri: imageUri,
      name: getUploadFileName(imageUri),
      type: getUploadMimeType(imageUri),
    } as unknown as Blob,
  );

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/receipt/upload`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });
  } catch {
    throw new UploadError(null, 'Could not reach the server. Check your connection and try again.', false);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    notifyIfUnauthorized(response.status);
    throw uploadErrorFor(response.status, body);
  }

  return toUniversalFinancialRecord(body as UploadReviewResponse);
}

// ── Save payload types ────────────────────────────────────────────────────────

export interface ReviewHintPayload {
  field: string;
  message: string;
}

export interface UFRItemPayload {
  description: string;
  amount: number | null;
  quantity: number | null;
  unit_price: number | null;
  category: string | null;
  metadata: Record<string, unknown>;
}

export interface UFRMetadataPayload {
  source: string;
  confidence: number | null;
  confidence_level: string | null;
  review_required: boolean | null;
  review_hints: ReviewHintPayload[];
  quality_score: number | null;
  parser_version: string;
  service_charge?: number | null;
  tax_amount?: number | null;
  delivery_charge?: number | null;
  discount_amount?: number | null;
  subtotal_amount?: number | null;
  confirm_total_mismatch?: boolean;
}

export interface SaveRecordPayload {
  record_id: string;
  document_type: string;
  merchant: string | null;
  document_date: string | null;
  currency: string | null;
  total_amount: number | null;
  payment_method: null;
  /** null lets the backend auto-categorise from the merchant and items. */
  category: string | null;
  items: UFRItemPayload[];
  metadata: UFRMetadataPayload;
}

export interface SaveRecordResponse {
  saved: boolean;
  record_id: string;
  document_type: string;
  category?: string | null;
}

export class SaveError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`Save failed with HTTP ${status}`);
  }
}

/**
 * POST the reviewed UFR payload to the backend save endpoint.
 *
 * Throws SaveError on non-2xx responses.
 * Throws a plain Error on network/timeout failures.
 * Never contacts Supabase or OpenAI directly.
 */
export async function saveFinancialRecord(
  payload: SaveRecordPayload,
): Promise<SaveRecordResponse> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/api/v1/financial-records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    });
  } catch (networkError) {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    notifyIfUnauthorized(response.status);
    throw new SaveError(response.status, body);
  }

  return body as SaveRecordResponse;
}
