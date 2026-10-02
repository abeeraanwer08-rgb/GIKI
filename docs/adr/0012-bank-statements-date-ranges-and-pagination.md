# ADR-0012: Bank Statements, Date Ranges and Pagination

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

Three gaps remained: bank statements could not be parsed, insights only ever
saw the latest 500 records, and the records list was unpaginated.

## Decision

### Bank statements

- `BankStatementParser` asks the vision model for header fields and one object
  per row (`debit` / `credit` / `balance`). The model never computes totals.
- Everything that decides trust is deterministic: sum of debits and credits vs
  the printed totals, `opening + credits − debits = closing`, the running
  balance row by row, rows with no amount, impossible (negative) values. Failures
  become review warnings; only negative amounts are hard errors.
- Only the last four digits of the account number are ever kept.
- One UFR per statement whose items are the *debits* (spending). Credits are
  summarised in `metadata.details`. `total_amount` is the sum of the debit items
  so the existing item/total reconciliation holds.
- **Saving fans out**: each spending row becomes its own `financial_records` row
  (merchant = description, own date and category). Insights group by merchant,
  category and month, so one lump per statement would be useless. Row ids are
  `uuid5(user | date | description | amount | balance | occurrence)`, so saving
  the same or an overlapping statement skips rows already stored
  (`Prefer: resolution=ignore-duplicates`) instead of double-counting.
- The heuristic classifier cannot reliably recognise a statement, so the upload
  endpoint accepts an explicit `document_type`. A mostly-white A4 page also
  averages far brighter than a receipt, so the image-quality brightness ceiling
  is raised when the user says it is a statement.

### Date ranges and pagination

- `GET /financial-records` takes `limit`, `offset`, `start_date`, `end_date`,
  `category` and returns `total` and `has_more` (PostgREST `Prefer: count=exact`).
- Insights, summary, ask and budgets read **every** record in range by paging
  through the table (page size 1000, hard cap 20 000) instead of a 500-row cut.
- The month-end forecast is only returned when the range includes today.

## Consequences

- Multi-page PDFs are not supported; statements are read one page at a time.
- A statement row cannot be edited after saving except by deleting and
  re-saving (there is no record delete endpoint yet).
