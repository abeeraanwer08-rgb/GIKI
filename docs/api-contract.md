# KharchAI — API Contract

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
  "document_type": "receipt"
}
```

Returns HTTP 409 when the record ID already exists, HTTP 422 for an invalid
UFR or unreconciled submitted total, and HTTP 503 when persistence is
unavailable.

---

### GET /api/v1/financial-records

Lists saved financial records, most recent first, shaped for the mobile
Home screen's transaction list.

**Response — HTTP 200**

```json
{
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

Returns HTTP 503 when persistence is unavailable.

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
