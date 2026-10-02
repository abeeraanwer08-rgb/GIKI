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

## Motion, Haptics and Interaction Polish

- Added a motion toolkit (`ui/motion.tsx`): staggered `FadeIn` entrances, an
  animated count-up for headline amounts, and `AnimatedBar` progress bars.
  The count-up uses `performance.now()` so a device clock change cannot
  stall or skip it.
- Added a vector `Logo` mark and an animated brand splash shown at launch.
- Added haptic feedback (`expo-haptics`) on buttons, tab presses, filter chips,
  transaction taps and successful saves; it no-ops where unsupported.
- Home: tappable transactions open a detail sheet with a "Set / Edit budget"
  action that opens the Budgets tab pre-selected on that category; category
  filter chips; staggered section entrances.
- Budgets: animated progress bars and total; the add sheet scrolls a preset
  category into view.
- Insights: the donut ring draws itself in; forecast bar animates.
- Review: replaced the plain "Saved" alert with an animated success sheet that
  shows the category the expense was filed under, with "Done" and
  "Scan another receipt".

## Accounts, Sign-in and Sturdier Receipt Scanning

- Added sign-up / sign-in (`/api/v1/auth/*`), scrypt hashing and signed tokens;
  all data routes now require a token and are scoped to the caller. Added
  migration `20260924000000_add_users_and_ownership.sql` and ADR-0011.
- Mobile: auth screen with validation and show/hide password, session kept in
  secure storage, profile sheet with sign-out, personalised greeting.
- Receipts: import from the photo library as well as the camera; 10 MB upload
  limit (413); scan failures give specific guidance and a retake-or-retry choice.
- 18 new backend tests (84 total), including per-user isolation and anonymous
  access refusal on every data route.

## Bank Statements, Date Ranges, Pagination and the Website

- Bank statement parser with deterministic checks, per-row expenses on save,
  duplicate-safe saving, explicit `document_type` on upload (ADR-0012).
- Date-range filtering (`start_date` / `end_date`) on insights, summary, ask and
  the records list; records list paginated; the 500-record cap is gone.
- Mobile: scan-type picker, statement review (row removal, locked total,
  summary), Load more on Home, Insights period selector, API URL via
  `EXPO_PUBLIC_API_URL`.
- Website (`web/`): landing page, auth, dashboard, transactions with filters and
  paging, upload and review (incl. statements), budgets, insights, assistant.
  CORS added to the backend for it.
- 125 backend tests, 8 website tests.

## Closing the Known Limitations

- Auth hardening (ADR-0013): emailed 6-digit codes for email verification and
  password reset, session revocation on reset, rate limiting on login, sign-up,
  reset and code entry; SMTP or console mail; migration `20261002000000`.
- Multi-page PDFs and photos for bank statements and invoices (ADR-0014), merged
  across pages; per-page quality errors; PDF rendering with PyMuPDF.
- Invoice parsing with deterministic maths checks, and a vision-model classifier
  that finds invoices and statements automatically.
- Robust statement dates: flexible parsing with the year from the period, flagged
  inheritance for undated rows, editable dates on web and mobile.
- Mobile: verify-email and forgot/reset screens, invoice type, PDF upload,
  add-another-page, editable statement dates. Website: verify and reset pages,
  multi-file/PDF upload, invoice review, editable statement dates.
- Fixed: the root `.gitignore` ignored `web/src/lib/`, so it was never committed.
- 210 backend tests, 12 website tests.

## A Database That Works Out of the Box

- SQLite store as the default database (Supabase still supported), `.env` loader,
  auto-generated local JWT secret, `seed_demo.py`, and clear 503/502 errors when
  the AI cannot read a document (ADR-0015). Verified by running the real server
  with no configuration: sign-up, sign-in, saved records, insights and budgets.
- README setup reduced to: install, set `OPENAI_API_KEY`, run.
- 234 backend tests.

## README and Screenshots

- README rewritten: screenshots, quick start, how it works, full settings table, API overview, troubleshooting and limitations. Screenshots live in `docs/screenshots/` (website pages and two phone montages), captured from a running copy with the demo account.
