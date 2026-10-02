# HissabAI — API Contract

## Implemented Endpoints

### GET /health

Returns the health status of the backend.

**Response — HTTP 200**

```json
{
  "status": "ok"
}
```

---

### Authentication

All of these are under `/api/v1/auth`. A token comes back from `signup` and
`login` as `{"token": "...", "user": {"id", "name", "email", "email_verified"}}`.

| Endpoint | Body | Result |
|---|---|---|
| `POST /signup` | `{name, email, password≥8}` | **201**; emails a 6-digit code. 409 email taken, 422 bad input, 429 too many sign-ups from one network, 503 server not configured |
| `POST /login` | `{email, password}` | **200**; 401 wrong credentials (identical for an unknown email); **429** after 5 wrong passwords for an email (or 20 from one network) — locked 15 minutes, `Retry-After` header and `retry_after` seconds |
| `GET /me` | — | the user, with `email_verified` |
| `POST /verify-email` | `{code}` (signed in) | **200** user; 400 wrong, expired or used-up code (5 wrong tries burn it) |
| `POST /resend-verification` | — (signed in) | **202**; 429 at most one a minute |
| `POST /forgot-password` | `{email}` | **202** with the same message whether or not the account exists; 429 after 3 a hour per email |
| `POST /reset-password` | `{email, code, new_password≥8}` | **200**; 400 wrong/expired code (same answer for an unknown email); signs out every existing session |

Codes are 6 digits, expire after 15 minutes, are stored only as a keyed hash, and
a new code replaces older ones.

Every other endpoint (except `/health`) requires `Authorization: Bearer <token>` and
returns **401** without a valid one (also after a password reset or account
deletion), and **403** `{"detail": {"error": "email_not_verified"}}` until the
email is verified. Data is scoped to the signed-in user.

---

### POST /api/v1/financial-records

Saves a user-approved `UniversalFinancialRecord` after validation. This
endpoint does not accept images, invoke OpenAI, or rerun document parsing.

**Request — `application/json`**

```json
{
  "record_id": "receipt-2026-08-12-001",
  "document_type": "receipt",
  "merchant": "Karachi Grocers",
  "document_date": "2026-08-12",
  "currency": "PKR",
  "total_amount": 450.5,
  "payment_method": null,
  "category": "groceries",
  "items": [
    {
      "description": "Rice",
      "amount": 300.0,
      "quantity": 1,
      "unit_price": 300.0,
      "category": "groceries",
      "metadata": {}
    },
    {
      "description": "Tea",
      "amount": 150.5,
      "quantity": 1,
      "unit_price": 150.5,
      "category": "groceries",
      "metadata": {}
    }
  ],
  "metadata": {
    "source": "receipt_analysis",
    "confidence": 0.9,
    "confidence_level": "high",
    "review_required": false,
    "review_hints": [],
    "quality_score": 95,
    "parser_version": "receipt-parser-v1"
  }
}
```

**Response — HTTP 201**

```json
{
  "saved": true,
  "record_id": "receipt-2026-08-12-001",
  "document_type": "receipt",
  "category": "groceries"
}
```

When `category` is omitted or null, HissabAI assigns one from the document
type, merchant and item descriptions (see ADR-0010).

Returns HTTP 409 when the record ID already exists, HTTP 422 for an invalid
UFR or unreconciled submitted total, and HTTP 503 when persistence is
unavailable.

---

### GET /api/v1/financial-records

Lists the signed-in user's saved records, most recent first, one page at a time.

**Query parameters (all optional)**

| Name | Meaning |
|---|---|
| `limit` | Page size, 1–200 (default 50) |
| `offset` | Records to skip (default 0) |
| `start_date`, `end_date` | Inclusive `YYYY-MM-DD` bounds on `transaction_date` |
| `category` | Only this category (e.g. `groceries`) |

`start_date` after `end_date`, a malformed date, or an out-of-range
`limit`/`offset` → HTTP 422.

**Response — HTTP 200**

```json
{
  "total": 133,
  "limit": 50,
  "offset": 0,
  "has_more": true,
  "records": [
    {
      "id": "receipt-2026-08-12-001",
      "document_type": "receipt",
      "merchant": "Karachi Grocers",
      "transaction_date": "2026-08-12",
      "amount": 450.5,
      "currency": "PKR",
      "category": "groceries"
    }
  ]
}
```

`total` counts every record matching the filters, across all pages.
Returns HTTP 503 when persistence is unavailable.

---

### Date ranges on insights

`GET /api/v1/insights`, `GET /api/v1/insights/summary` and
`POST /api/v1/insights/ask` accept optional inclusive `start_date` and
`end_date` (`YYYY-MM-DD`) query parameters. Every record in the range is used
(there is no longer a 500-record cap). The summary echoes `start_date` /
`end_date`, and `current_month` (the forecast) is `null` when the range does not
include today. An inverted range → HTTP 422.

---

### POST /api/v1/receipt/upload — files, PDFs and `document_type`

`multipart/form-data` with the `file` field and an optional `document_type`:
`receipt`, `invoice`, `bank_statement`, `utility_bill`, `wallet_screenshot` or
`auto` (default). An explicit type skips classification; an unknown value → 422.

- **Pages:** send `file` once for one image or PDF, or repeat it for the pages of
  one document in order (images and/or a PDF). PDFs are rendered page by page.
  Limits: 10 MB per file, 25 MB in total, 12 pages → **413** / **422**
  (`Too many pages`). A damaged, password-protected or empty PDF → 422
  (`Unusable PDF`, with a user-safe `message`).
- **Which types may span pages:** `bank_statement` and `invoice`. Several pages of
  any other type → 422 `multi_page_unsupported`.
- Every page must pass the image-quality check; a failure → 400 naming the `page`.
  Pages are read in parallel and merged: header fields from the first page that
  has them, totals from the last, rows repeated across a page break dropped, and
  a year-less date resolved with the period printed on any page.
- **Auto-detection:** when the image heuristics are unsure the vision model
  double-checks the type (and is only trusted when it is confident); a failure
  falls back to the heuristics. Bank statements and invoices are best sent with an
  explicit `document_type`.

**Invoices** return the usual review shape: `extracted_items` are the lines;
`editable_fields.merchant` is the vendor, `purchase_date` the invoice date;
`processing_metadata` carries `subtotal_amount`, `tax_amount`,
`delivery_charge` (shipping), `discount_amount` and
`details.{invoice_number, due_date, payment_terms, vendor_tax_id}`; warnings flag
a line whose qty × price ≠ amount, lines ≠ subtotal, or subtotal + tax + shipping
− discount ≠ total.

For a statement the response is the usual review shape with:

- `extracted_items` — one per **debit** row (`description`, `amount`,
  `category`, `metadata.date`, `metadata.date_inferred`, `metadata.balance`,
  `metadata.reference`); credits are not spending and are summarised instead.
  Printed dates are parsed in code (`05/09/2026`, `05-Sep`, `Sep 5, 2026`…); a row
  that printed no date gets the previous row's date with `date_inferred: true`; a
  printed date that cannot be read stays `null`.
- `editable_fields.merchant` = bank name, `purchase_date` = period end,
  `total_amount` = sum of the debit rows, plus `period_start`, `period_end`,
  `account_last4`.
- `processing_metadata.details` — `opening_balance`, `closing_balance`,
  `debit_count`, `credit_count`, `total_credits`.
- `validation_warnings` — printed totals that do not match the rows, a broken
  running balance, rows without an amount, missing header fields, rows without a
  readable date, rows with an assumed date, and dates outside the period.

Saving rejects a row whose `metadata.date` is not a real `YYYY-MM-DD` (422,
`Transaction N has an invalid date`); a row with no date is filed on the
statement end date.

Saving a `bank_statement` UFR (`POST /api/v1/financial-records`) stores **one
record per debit row** (ids derived from the row's content) and returns
`records_saved`. Rows already stored are skipped; if every row already exists →
HTTP 409 (`Financial record already exists`).

---

### GET /api/v1/insights

Computes a deterministic spending summary from saved financial records and
asks the LLM to narrate insights and recommendations grounded in that
summary. The LLM never invents or recomputes figures.

**Response — HTTP 200**

```json
{
  "summary": {
    "record_count": 2,
    "total_amount": 1000.0,
    "currency": "PKR",
    "by_category": [
      {"category": "groceries", "total_amount": 1000.0, "record_count": 2}
    ],
    "by_month": [
      {"month": "2026-08", "total_amount": 1000.0, "record_count": 2}
    ],
    "top_merchants": [
      {"category": "Karachi Grocers", "total_amount": 1000.0, "record_count": 2}
    ]
  },
  "headline": "Groceries made up all of your recent spending.",
  "insights": ["Karachi Grocers is your only merchant this period."],
  "recommendations": ["Set a monthly groceries budget to track this trend."]
}
```

Returns HTTP 503 when Supabase or OpenAI is unavailable.

---

### POST /api/v1/insights/ask

Answers a free-form question grounded only in the same deterministic
spending summary used by `GET /api/v1/insights`.

**Request — `application/json`**

```json
{
  "question": "What did I spend the most on?"
}
```

**Response — HTTP 200**

```json
{
  "question": "What did I spend the most on?",
  "answer": "You spent the most on groceries, totaling PKR 1000."
}
```

Returns HTTP 422 for a blank question and HTTP 503 when Supabase or OpenAI
is unavailable.

---

### GET /api/v1/insights/summary

The deterministic summary only — no LLM call. Includes everything in
`summary` above plus:

```json
{
  "current_month": {
    "month": "2026-09",
    "spent_to_date": 20540.0,
    "days_elapsed": 23,
    "days_in_month": 30,
    "projected_total": 26791.3
  },
  "anomalies": [
    {
      "record_id": "r7",
      "merchant": "Fancy Grill",
      "category": "restaurant",
      "amount": 4500.0,
      "typical_amount": 1420.0,
      "ratio": 3.2,
      "transaction_date": "2026-09-21"
    }
  ]
}
```

---

### GET /api/v1/budgets

This month's spending against each category budget.

```json
{
  "month": "2026-09",
  "currency": "PKR",
  "total_limit": 25000.0,
  "total_spent": 19640.0,
  "alerts": 2,
  "budgets": [
    {
      "category": "utilities",
      "monthly_limit": 6000.0,
      "spent": 6200.0,
      "remaining": -200.0,
      "percent_used": 103.3,
      "status": "over"
    }
  ]
}
```

`status` is `on_track` (< 80%), `warning` (≥ 80%) or `over` (≥ 100%).

### PUT /api/v1/budgets/{category}

Body `{"monthly_limit": 10000}`. Creates or replaces the budget and returns
the updated overview. HTTP 422 for an unknown category or a non-positive
limit.

### DELETE /api/v1/budgets/{category}

Removes the budget and returns the updated overview.

All budget endpoints return HTTP 503 when storage is unavailable.

---

## Future Endpoints (Not Implemented)

### POST /analyze-receipt

> ⚠️ **This endpoint is NOT implemented.** It is documented here for planning purposes only.

Accepts a receipt image and returns structured financial data extracted by AI.

**Request**

```
Content-Type: multipart/form-data

image: <receipt image file>
```

**Response concept — HTTP 200**

```json
{
  "merchant": "...",
  "date": "...",
  "currency": "PKR",
  "total": 0,
  "items": [
    {
      "name": "...",
      "amount": 0,
      "category": "..."
    }
  ]
}
```

This endpoint will require OpenAI multimodal AI integration (not in scope for Milestone 1).
