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

## Home Transaction List and Insights Screen

- Added `GET /api/v1/financial-records` to list saved records, most recent
  first, shaped for a mobile transaction list. Returns HTTP 503 when
  persistence is unavailable, matching the existing endpoint's convention.
- Replaced the Home screen's permanent empty state with a real "Recent
  Transactions" list backed by that endpoint, refetched whenever Home
  regains focus (e.g. after saving an expense), plus a running total-tracked
  summary in the header. The empty/error states are preserved for the
  no-data and offline cases.
- Added a new Insights screen (`GET /api/v1/insights` and
  `POST /api/v1/insights/ask`): a spending-by-category breakdown, the
  AI-generated headline/insights/recommendations, and a free-form "Ask
  KharchAI" question box — all grounded in the deterministic summary.
- Added `insightsService.ts` and typed request/response shapes reusing the
  existing service-layer error-handling pattern.
- Preserved all existing screens, navigation, and save/review behavior.

## Visual Polish Pass

- Replaced emoji icons across Home, Insights, and Add Expense with
  `@expo/vector-icons` (Ionicons), colored per category via a shared
  `getCategoryStyle` helper (groceries/restaurant/utilities/wallet each get
  a distinct icon + color).
- Added `expo-linear-gradient` for the Home header and Insights hero card.
- Restyled transaction rows, category bars, and insight/recommendation
  bullets with icon badges instead of plain text bullets; restyled the Ask
  box with an icon send button and an icon-badged answer bubble.
- Verified visually via the same local Expo web preview against sample data
  before committing.

## Professional Mobile Redesign

- Added a mobile design system in `mobile/app/ui/`: colour, spacing, radius,
  shadow and typography tokens (Inter via `@expo-google-fonts/inter`), plus
  shared `Txt`, `Card`, `Button`, `IconBadge`, `SectionHeader`, `EmptyState`,
  `Skeleton` and SVG `DonutChart` components.
- Replaced the single stack with bottom-tab navigation (Home, Insights) and a
  floating "Add expense" action, via `@react-navigation/bottom-tabs`.
- Home: gradient dashboard with this-month spend, category share bar,
  quick actions, and activity grouped by day; skeleton loading and empty/error
  states with actions.
- Insights: AI summary card, stat tiles, category donut chart with legend,
  insights, numbered recommendations, and a chat-style Ask box with
  suggested questions.
- Scan flow: redesigned camera controls and quality-warning sheet, preview
  bottom sheet with a readability checklist, a step-by-step processing screen
  with retry/retake on failure, and a Review screen with labelled inputs,
  confidence card, and summary. Save/validation logic is unchanged.
- Added `accessibilityRole` to icon-only buttons.
- Verified every screen visually via a local Expo web preview with sample
  data; preview-only scaffolding was removed before committing.
## HissabAI: Categorisation, Budgets, Forecast and Bilingual Assistant

- Renamed the app to **HissabAI** (app name, package id, UI copy, API title),
  keeping credit to the original KharchAI codebase in the README.
- Added a rule-based `CategorizationService` for Pakistani merchants and
  items. Records saved without a category are categorised on save (source
  stored in `metadata.category_source`); older uncategorised records are
  categorised on read. The Review screen gained an "Auto-detect" / manual
  category picker, and the save response now returns the category.
- Added monthly category budgets: `budgets` table migration, Supabase
  client upsert/delete, `BudgetService` (on_track / warning ≥ 80% / over ≥ 100%),
  and `GET/PUT/DELETE /api/v1/budgets`. New Budgets tab with add/edit sheet;
  Home shows a budget-alert banner.
- Extended `FinancialSummary` with a month-end forecast and unusual-spending
  detection (≥ 2× the category median), exposed LLM-free via
  `GET /api/v1/insights/summary`. Shown on Home (forecast chip) and Insights
  (forecast card, "Unusual spending" card).
- Assistant prompt now replies in the question's language (English, Urdu
  script, Roman Urdu). New Assistant tab with bilingual suggestions; the Ask
  box moved there from Insights.
- Four-tab navigation: Home, Budgets, Insights, Assistant.
- 21 new backend tests (66 total). Added ADR-0010.
