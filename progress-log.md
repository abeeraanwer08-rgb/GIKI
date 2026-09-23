# KharchAI Progress Log

## Universal Financial Record Foundation

- Added the generic `UniversalFinancialRecord` schema.
- Added generic UFR items and processing metadata for source, confidence,
  quality score, and parser version.
- Added a receipt-analysis-to-UFR mapper.
- Added UFR generation to the receipt pipeline without changing the public
  `ReceiptUploadResponse`.
- Preserved the existing receipt extraction, validation, quality checks, and
  classifier behavior.
- Added ADR-0001 documenting the UFR decision.

## Financial Document Processing Pipeline

- Added `FinancialPipeline` and a shared `PipelineContext`.
- Split orchestration into quality, classifier, parser, validation, and UFR
  stages.
- Kept the receipt route's public response model, Swagger contract, and error
  behavior unchanged.
- Added receipt parser dispatch using the existing receipt analysis service.
- Registered the utility-bill parser entry point for future implementation.
- Added ADR-0003 documenting the pipeline architecture.

## Pakistani Utility Bill Parser MVP

- Added `UtilityBillAnalysisService` with structured OpenAI Vision extraction
  for provider, bill type, consumer number, billing period, issue date, due
  date, amount due, and currency.
- Added null-safe parsing and utility-specific validation.
- Added utility-bill classifier routing and pipeline dispatch.
- Added utility-bill-to-UFR mapping while preserving the existing upload
  response schema.
- Receipt extraction and its prompt remain unchanged.
- Added ADR-0002 documenting the utility-bill parser MVP.

## Parser Registry

- Added `ParserRegistry` with receipt and utility-bill registrations.
- Refactored `ParserStage` to resolve parsers from the registry.
- Preserved existing parser services, validation, UFR mapping, and API
  response behavior.
- Added controlled unsupported-document handling for registry lookup misses.
- Added ADR-0003 documenting parser registry architecture.

## Wallet Screenshot Parser MVP

- Added a typed `WalletAnalysisResponse` schema for EasyPaisa/JazzCash
  transaction screenshots.
- Added `WalletParser` with the existing OpenAI Vision integration and a
  file-backed structured JSON prompt.
- Added null-safe extraction for wallet name, transaction type, amount,
  currency, counterparty, date, time, and transaction reference.
- Registered wallet screenshots in `ParserRegistry`.
- Added wallet screenshot classifier routing and wallet-specific validation.
- Mapped wallet transactions into the existing UFR, retaining wallet-specific
  fields in item metadata.
- Preserved the existing receipt-shaped upload response and receipt/utility
  parser implementations.
- Added ADR-0005 documenting the wallet parser architecture.

## Confidence Scoring Engine MVP

- Added a deterministic `ConfidenceService` with weighted image-quality,
  required-field completeness, validation, and parser-confidence factors.
- Added HIGH, GOOD, MEDIUM, and LOW score levels with review decisions.
- Added a post-UFR `ConfidenceStage` that enriches only internal UFR metadata.
- Preserved the existing upload response schema and quality-gate behavior.
- Added ADR-0006 documenting the confidence-scoring architecture.

## Intelligent Human Review Workflow MVP

- Added deterministic `ReviewHintService` for field-level review explanations.
- Added `ReviewHint` metadata entries containing `field` and `message`.
- Added post-confidence `ReviewHintsStage` for missing fields, total
  mismatches, and low image quality.
- Added utility-bill hints for missing consumer number, billing period, and due
  date.
- Added wallet hints for missing transaction reference and direction.
- Preserved the existing upload response schema.
- Added ADR-0007 documenting the review-hint workflow.

## Review Response Builder MVP

- Added a typed `ReviewResponse` schema for the Android Review Screen.
- Added editable extracted fields with propagated deterministic confidence.
- Added extracted UFR items, validation warnings, review hints, and processing
  metadata to the frontend-facing response.
- Added document-specific editable fields for utility bills and wallet
  screenshots while preserving their UFR item metadata.
- Preserved legacy `status`, `quality`, `validation`, and `receipt` fields
  inside the new response for backward compatibility.
- Integrated response construction after quality, classification, parsing,
  validation, UFR mapping, confidence, and review-hint stages.
- Verified receipt, utility-bill, and wallet pipeline paths, route OpenAPI
  output, HTTP 200 serialization, MIME rejection, quality rejection, and
  unsupported-document behavior.
- Added ADR-0008 documenting the Review Response boundary.

## Financial Calculations and AI Financial Reasoning MVP

- Added `SupabaseClient.list_financial_records()` to read back saved records.
- Added a deterministic `FinancialCalculationsService` producing a
  `FinancialSummary` (total spend, spend by category, spend by month, top
  merchants) with no LLM involvement.
- Added `FinancialReasoningService`, which reasons only over the computed
  `FinancialSummary` (never raw records) to generate narrative insights and
  recommendations, or answer a free-form question.
- Added `GET /api/v1/insights` (deterministic summary + AI insights) and
  `POST /api/v1/insights/ask` (grounded natural-language Q&A).
- Both endpoints return HTTP 503 when Supabase or OpenAI is unavailable,
  matching the existing persistence-endpoint error convention.
- Preserved all existing upload, save, and review-response behavior; this is
  a purely additive read path.
- Added ADR-0009 documenting the calculations/reasoning boundary.