# HissabAI

**HissabAI** (*hisaab*, حساب — "accounts") is an AI-powered personal finance
copilot for Pakistan. Scan a receipt, bill or wallet screenshot; HissabAI reads
it, categorises it, tracks it against your budgets, forecasts your month, flags
unusual spending, and answers questions about your money in English, Urdu or
Roman Urdu.

---

## Credits and contributions

HissabAI builds on the **KharchAI** codebase by
[zara1990](https://github.com/zara1990/Kharchai), which provided the FastAPI
document pipeline (receipt, utility-bill and wallet-screenshot parsing,
validation, confidence scoring, review hints), Supabase persistence, and the
original Expo mobile app (receipt capture, review and save flow). The original
commit history is preserved in this repository.

Work added on top of that base in this repository:

- **AI financial reasoning layer** — deterministic spending calculations plus
  LLM-generated insights, recommendations and grounded Q&A
  (`GET /api/v1/insights`, `POST /api/v1/insights/ask`, ADR-0009).
- **Smart categorisation** — rule-based categoriser tuned for Pakistani
  merchants (K-Electric, SNGPL, Imtiaz, Cheezious, Careem, Easypaisa…) applied
  on save and to older uncategorised records, with a user override on the
  Review screen (ADR-0010).
- **Budgets** — monthly limit per category with on-track / warning / over
  status and alerts (`/api/v1/budgets`, `budgets` table migration).
- **Forecast & unusual-spending detection** — month-end projection from the
  current pace, and flags for records at least 2× the category's usual amount
  (`GET /api/v1/insights/summary`).
- **Bilingual AI assistant** — full chat tab answering in English, Urdu script
  or Roman Urdu, grounded in the user's own numbers.
- **Saved-records API** — `GET /api/v1/financial-records` for the mobile app.
- **Mobile design system & redesign** — theme tokens, Inter typography, shared
  UI components, four-tab navigation (Home, Budgets, Insights, Assistant) with
  a floating add button, donut chart, and a redesigned scan → review flow.

---

## Current Milestone: Budgets, Smart Categorisation and Bilingual Assistant

Saved records are auto-categorised, tracked against monthly category budgets,
projected to month end, and checked for unusual spending. A bilingual
assistant answers questions grounded in those numbers. See
[`docs/adr/0010-categorisation-budgets-and-forecasting.md`](docs/adr/0010-categorisation-budgets-and-forecasting.md)
and
[`docs/adr/0009-financial-insights-and-ai-reasoning.md`](docs/adr/0009-financial-insights-and-ai-reasoning.md).

---

## Project Structure

```
backend/        # Python FastAPI backend
  main.py       # Application entry point
  routes/       # API route modules (future)
  services/     # Business logic (future)
  models/       # Data models (future)
  schemas/      # Pydantic schemas (future)
  utils/        # Utility helpers (future)
docs/           # Architecture and API documentation
mobile/         # Expo React Native Android app (future milestone)
```

---

## Running the Backend

From the project root:

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

---

## Testing GET /health

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{"status": "ok"}
```

---

## Testing the financial insights endpoints

```bash
curl http://localhost:8000/api/v1/insights

curl -X POST http://localhost:8000/api/v1/insights/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What did I spend the most on?"}'
```

Both endpoints require `OPENAI_API_KEY`, `SUPABASE_URL`, and
`SUPABASE_SERVICE_ROLE_KEY` to be configured server-side.

---

## Interactive API Documentation

Once the backend is running, open:

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

---

## Supabase configuration

The backend requires these server-side environment values:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` to Android or API clients. Apply both
migrations in order:

1. [`supabase/migrations/20260811000000_create_financial_records.sql`](supabase/migrations/20260811000000_create_financial_records.sql)
2. [`supabase/migrations/20260923000000_create_budgets.sql`](supabase/migrations/20260923000000_create_budgets.sql)

## What is NOT implemented yet

- Authentication (all persisted/summarized records are currently shared,
  not scoped per user)
- Bank statement parsing (receipts, utility bills, and wallet screenshots
  are supported)
- Date-range filtering / pagination for insights (currently the most
  recent 500 saved records)

See [`docs/architecture.md`](docs/architecture.md) for the planned architecture  
and [`docs/api-contract.md`](docs/api-contract.md) for future API contracts.
