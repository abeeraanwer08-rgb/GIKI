# ADR-0009: Add Financial Calculations and AI Financial Reasoning

- **Status:** Accepted
- **Date:** 2026-09-23

## Context

KharchAI persists reviewed Universal Financial Records (UFR) to Supabase, but
nothing yet reads them back. The architecture doc has always listed
"Financial Calculations" and "AI Financial Reasoning" as the two remaining
un-built stages after the receipt/utility-bill/wallet extraction pipeline —
this milestone builds them.

The risk with LLM-driven financial reasoning is that the model can silently
invent or miscompute numbers. Every other AI-facing feature in this codebase
(confidence scoring, review hints) keeps arithmetic deterministic and uses
the LLM only for extraction or narrative. This milestone follows the same
split.

## Decision

Add two new services with a strict boundary between them:

- `FinancialCalculationsService` (deterministic, no LLM): fetches saved
  records via a new `SupabaseClient.list_financial_records()` query method
  and aggregates them into a `FinancialSummary` — total spend, spend by
  category, spend by month, and top merchants. This is pure arithmetic over
  stored `amount`/`category`/`merchant_provider`/`transaction_date` columns.

- `FinancialReasoningService` (LLM-only): takes the already-computed
  `FinancialSummary` — never raw records — and asks `gpt-4.1-mini` to
  produce either (a) a narrative headline/insights/recommendations, or
  (b) a direct answer to a free-form user question. The prompt explicitly
  instructs the model not to invent or recompute figures.

Two new endpoints expose this under `/api/v1/insights`:

- `GET /api/v1/insights` — returns the deterministic summary plus
  AI-generated insights and recommendations.
- `POST /api/v1/insights/ask` — answers a natural-language question grounded
  only in the same deterministic summary.

Both endpoints return HTTP 503 if Supabase or OpenAI is unavailable, matching
the existing persistence-endpoint error convention, rather than failing with
an unhandled exception.

## Consequences

### Positive

- Every number a user sees (totals, category/month breakdowns) is
  deterministic and independent of model behavior — only the surrounding
  narrative is LLM-generated.
- Reuses the existing lazy `AsyncOpenAI` client pattern and JSON-only prompt
  style already established by `ReceiptAnalysisService`.
- No change to the existing upload or save endpoints or the UFR/database
  schema — this is a purely additive read path.

### Limitations

- There is no per-user scoping yet (no auth), so the summary is computed
  over all saved records. This matches the rest of the current milestone
  scope, which has no authentication.
- `list_financial_records` caps at 500 rows; pagination/date-range filtering
  is left for a future milestone if the record volume requires it.
- Insights and answers are only as good as the deterministic summary's
  granularity (e.g. no day-level or per-item breakdown yet).
