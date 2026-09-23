# KharchAI

**KharchAI** is an AI-powered financial copilot for Pakistan.  
It helps users track expenses by analysing receipts and providing intelligent financial insights.

---

## Current Milestone: Financial Calculations and AI Financial Reasoning

The backend uses **Python + FastAPI** with a server-side Supabase foundation
for the Universal Financial Record pipeline. Saved records now feed a
deterministic spending summary and an AI reasoning layer that generates
insights, recommendations, and answers to natural-language questions —
grounded strictly in that summary. See
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

Never expose `SUPABASE_SERVICE_ROLE_KEY` to Android or API clients. Apply the
initial database schema from
[`supabase/migrations/20260811000000_create_financial_records.sql`](supabase/migrations/20260811000000_create_financial_records.sql).

## What is NOT implemented yet

- Authentication (all persisted/summarized records are currently shared,
  not scoped per user)
- Bank statement parsing (receipts, utility bills, and wallet screenshots
  are supported)
- Date-range filtering / pagination for insights (currently the most
  recent 500 saved records)

See [`docs/architecture.md`](docs/architecture.md) for the planned architecture  
and [`docs/api-contract.md`](docs/api-contract.md) for future API contracts.
