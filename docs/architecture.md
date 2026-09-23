# HissabAI — Planned Architecture

> **Note:** This documents the intended architecture. Some downstream
> components remain future milestones.

## High-Level Data Flow

```
Android Expo App
  → FastAPI Backend
    → OpenAI Multimodal AI
      → Structured JSON
        → Validation
          → Supabase
            → Financial Calculations
              → AI Financial Reasoning
                → Android App
```

## Components

| Component | Status |
|---|---|
| Android Expo App | Not implemented |
| FastAPI Backend | ✅ Implemented through ReviewResponse pipeline |
| OpenAI Multimodal AI | ✅ Implemented for current parsers |
| Structured JSON response parsing | ✅ Implemented |
| Validation layer | ✅ Implemented |
| Supabase persistence | ✅ Reviewed UFR save endpoint |
| Financial Calculations | ✅ Deterministic spending summary |
| AI Financial Reasoning | ✅ Insights and Q&A grounded in the summary |

## Supabase foundation

Supabase is a backend-only persistence dependency. The server-side client reads
these environment values:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The service-role key must remain server-side and must never be placed in
Android code or returned by an API. The initial UFR-oriented schema is located
at
`supabase/migrations/20260811000000_create_financial_records.sql`.

The reviewed-record save endpoint accepts a validated UFR and inserts it into
`public.financial_records` without overwriting an existing record ID.

## Financial calculations and AI reasoning

`FinancialCalculationsService` reads saved records via
`SupabaseClient.list_financial_records()` and deterministically aggregates
them into a `FinancialSummary` (total spend, spend by category, spend by
month, top merchants). No LLM is involved in this step.

`FinancialReasoningService` takes only the computed `FinancialSummary` — never
raw records — and asks the LLM to narrate insights/recommendations or answer a
free-form question, grounded strictly in the given figures. Both are exposed
under `/api/v1/insights` (`GET` for insights, `POST /ask` for Q&A). See
ADR-0009.
