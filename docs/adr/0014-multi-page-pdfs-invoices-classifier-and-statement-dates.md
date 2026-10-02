# ADR-0014: Multi-page PDFs, Invoices, the Vision Classifier and Statement Dates

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

ADR-0012 left four gaps: statements were read one image at a time, invoices were
not supported (and could not be detected), and unreadable statement dates were
simply dropped.

## Decision

### Pages and PDFs
- The upload endpoint accepts a repeated `file` field and PDFs. PDFs are rendered
  with PyMuPDF (no poppler) at ~170 dpi, capped at 12 pages / 10 MB per file /
  25 MB total; PDF-ness is decided from the bytes, not the declared type.
- `FinancialPipeline.process_pages` classifies from page 1 **first** (the
  page-aware quality thresholds depend on the type), requires the type to register
  `merge_pages` (bank statements and invoices), quality-checks every page (failure
  names the page), reads the pages in parallel (3 at a time) and merges them, then
  runs the same validation/mapping/confidence/review stages as a single image.
- Statement merge: header from the first page that has each field, closing balance
  and printed totals from the last (summed when several pages print one — per-page
  subtotals), a row repeated at the top of the next page with the same running
  balance is dropped, and dates are re-resolved with the merged period.

### Invoices
`InvoiceParser` extracts vendor, tax id, invoice number, dates, terms, lines and
subtotal/tax/discount/shipping/total. All trust decisions are code: qty × price per
line, lines vs subtotal, subtotal + tax + shipping − discount vs total, due before
invoice date, negatives. Mapped to the generic record (lines → items, charges →
existing metadata fields) so the existing save-time reconciliation applies.

### Vision classifier
Image heuristics cannot see invoices or statements. When the heuristic answer is
not "high" confidence and the user did not choose a type, a small vision call
(`detail: low`, 1024 px thumbnail) classifies the document; its answer is used only
when it is itself "high", and any error falls back to the heuristics. A user's
explicit choice always wins and makes no call. `AI_CLASSIFIER=off` disables it.

### Statement dates
The model copies the printed date into `date_text` (and fills `date` only when the
year is printed). `services/statement_dates.py` parses common formats (day-first,
month-first only when that is the only reading inside the period, month names,
2-digit years) and takes a missing year from the statement period, including across
a year boundary. A row that printed **no** date takes the previous row's date and is
flagged `date_inferred`; a printed date that cannot be read stays blank and is
flagged — it is never replaced by a neighbour's. Carried-forward balance lines are
not transactions. The review UIs make every row's date editable; saving rejects a
malformed date and files a blank one on the statement end date.

## Consequences
- More vision-model calls per statement (one per page) and one small classifier call
  for auto-detected uploads.
- A white page photographed without choosing its type can still fail the receipt
  brightness check; choosing the type relaxes it.
