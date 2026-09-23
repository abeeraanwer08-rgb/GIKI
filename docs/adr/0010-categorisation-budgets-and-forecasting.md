# ADR-0010: Smart Categorisation, Budgets, and Spending Forecasts

- **Status:** Accepted
- **Date:** 2026-09-23

## Context

Records saved from the mobile Review screen arrived with `category = null`,
so the insights layer grouped almost everything as "uncategorized" and could
not say where money went. Users also had no way to set spending limits, see
where the month was heading, or spot a transaction that was far out of line
with their usual spending.

As with ADR-0009, every number a user sees must be deterministic and
explainable. The LLM may narrate those numbers but must not produce them.

## Decision

### Categorisation (`services/categorization.py`)

A rule-based `CategorizationService` assigns one of nine categories
(groceries, restaurant, utilities, transport, shopping, health, mobile,
wallet, other) in order of evidence strength:

1. **Document type** — utility bills → utilities, wallet screenshots → wallet.
2. **Merchant keywords** — a dictionary of Pakistani merchants and terms
   (K-Electric, LESCO, SNGPL, Imtiaz, Cheezious, Careem, Easypaisa, …).
3. **Item keywords** — majority vote across line-item descriptions.
4. Otherwise **other**.

Keywords match on word boundaries (optionally plural), so "mart" does not
match "Smartphone". It runs when a record is saved without a category (a
user-chosen category is kept) and is also applied when reading older records,
so existing data benefits without a migration. The chosen source is stored in
`metadata.category_source` (`user`, `document_type`, `merchant`, `items`,
`default`).

Rules were chosen over an LLM call so the same record always lands in the
same category, the save path stays synchronous and offline-testable, and the
decision can be explained ("matched 'k-electric'").

### Budgets (`services/budgets.py`, `/api/v1/budgets`)

A new `budgets` table stores one monthly limit per category. Spending against
each limit is computed on read from this month's `financial_records`, so no
counters can drift. Status is `on_track` below 80%, `warning` from 80%, and
`over` from 100%.

### Forecast and unusual spending (`services/financial_calculations.py`)

`FinancialSummary` gains:

- `current_month` — month-to-date spend and a straight-line projection:
  `spent_to_date / days_elapsed × days_in_month`.
- `anomalies` — records at least **2×** the median of the other records in
  the same category, only when the category has at least two other records.
  The median resists being skewed by the outlier itself.

`GET /api/v1/insights/summary` exposes this summary without calling the LLM,
so the mobile Home screen can show the forecast cheaply. The insights and
assistant prompts may reference both fields, and the assistant replies in the
language of the question (English, Urdu script, or Roman Urdu).

## Consequences

### Positive

- Insights, budgets and the donut chart now group spending meaningfully.
- All new figures are deterministic and covered by unit tests.
- No change to the upload pipeline or the UFR save contract; the save
  response only gains an optional `category` field.

### Limitations

- Keyword rules miss merchants they do not know; those fall back to "other"
  and can be corrected by the user on the Review screen.
- The forecast is linear and ignores one-off bills early in the month.
- Anomaly detection needs at least three records in a category.
- Budgets are global (no per-user scoping), matching the current lack of
  authentication.
