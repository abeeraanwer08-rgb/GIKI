# KharchAI Master Context

## Project

KharchAI is an AI-powered financial copilot for Pakistan. The backend is a
Python 3.11 FastAPI service in `backend/`; the Android Expo application is
planned for a later milestone.

## Current backend pipeline

```text
Upload
  → FinancialPipeline
      → Image Quality Stage
      → Classifier Stage
      → Parser Stage
          → Parser Registry
              → ReceiptAnalysisService
              → UtilityBillAnalysisService
              → WalletParser
      → Validation Stage
      → UFR Stage
      → Confidence Stage
      → Review Hints Stage
       → Review Response Builder
  → ReviewResponse
```

Receipt extraction, validation, and quality gates remain unchanged. The upload
endpoint now returns a frontend-friendly `ReviewResponse` containing document
type, editable extracted fields, extracted items, validation warnings, review
hints, confidence, and processing metadata. The legacy `status`, `quality`,
`validation`, and `receipt` fields remain embedded for backward compatibility.

The route is intentionally limited to request handling: MIME validation, byte
reading, context creation, and returning the pipeline result. Business logic
lives in the reusable pipeline stages.

The parser stage now dispatches `document_type="utility_bill"` to
`UtilityBillAnalysisService`. Its structured utility output is validated,
projected into the unchanged legacy response shape, and mapped into the UFR.

The parser stage also dispatches `document_type="wallet_screenshot"` to
`WalletParser` for EasyPaisa/JazzCash transaction screenshots. Wallet output is
validated, projected into the unchanged legacy response shape, and mapped into
the UFR with wallet-specific fields retained in item metadata.

Parser selection is centralized in `ParserRegistry`. New document parsers are
registered there rather than adding document-type branches to the pipeline.

## Universal Financial Record foundation

`UniversalFinancialRecord` is the canonical internal representation for
financial documents. The current receipt adapter maps
`ReceiptAnalysisResponse` into a UFR after normalization. The UFR is internal
for now and is not added to the existing upload response, preventing a breaking
API change.

The UFR supports:

- receipts
- Pakistani utility bills (electricity and gas MVP)
- EasyPaisa/JazzCash wallet screenshots (MVP)
- future bank statements

Future document-specific parsers should produce their own extraction output and
map it into the same UFR schema before persistence, calculations, or financial
reasoning.

After UFR creation, `ConfidenceStage` deterministically enriches UFR metadata
with a normalized confidence score, confidence level, and review decision. It
combines image quality (30%), required-field completeness (30%), validation
result (20%), and classifier/parser confidence (20%). It does not use the LLM.
The upload response remains unchanged.

After confidence scoring, `ReviewHintsStage` deterministically analyzes the
generated UFR, image quality, and validation report. It stores field-level
`{field, message}` hints in UFR metadata for missing receipt, utility-bill, and
wallet fields, validation mismatches, and low image quality. It does not use
the LLM.

After review hints, `ReviewResponseBuilder` reshapes the completed UFR and
pipeline reports into the Android Review Screen response. It exposes generic
editable fields for every document and document-specific fields for utility
bills and wallet screenshots. It does not invoke parsers, validators, the LLM,
or persistence. The legacy receipt-shaped fields remain embedded in the
response so existing clients can continue reading them.

## Financial calculations and AI reasoning

`FinancialCalculationsService` reads saved records from Supabase via
`SupabaseClient.list_financial_records()` and deterministically aggregates
them into a `FinancialSummary` — total spend, spend by category, spend by
month, and top merchants. It does not use the LLM.

`FinancialReasoningService` reasons only over the already-computed
`FinancialSummary`, never raw records, to produce either narrative
insights/recommendations or a direct answer to a free-form question. The
prompt explicitly forbids inventing or recomputing figures, so every number
the user sees stays deterministic and only the narrative is LLM-generated.

Both are exposed under `/api/v1/insights` (`GET` for insights,
`POST /ask` for Q&A), returning HTTP 503 when Supabase or OpenAI is
unavailable, matching the existing persistence-endpoint error convention.

## Workflow conventions

- Inspect the repository before every milestone change.
- Implement one explicit milestone at a time.
- Preserve working behavior and existing API contracts unless a milestone
  explicitly changes them.
- Do not add Supabase, authentication, mobile, dashboards, or other future
  scope without an explicit milestone.