"""API routes for AI-generated financial insights and natural-language Q&A."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status

from routes.auth import get_current_user
from schemas.insights import AskRequest, AskResponse, InsightsResponse
from services.financial_calculations import FinancialCalculationsService, FinancialSummary
from services.financial_reasoning import FinancialReasoningError, FinancialReasoningService
from services.supabase_client import (
    SupabaseClient,
    SupabaseConfigurationError,
    SupabaseConnectionError,
    get_supabase_client,
)
from services.tokens import TokenUser

router = APIRouter(
    prefix="/api/v1/insights",
    tags=["Financial Insights"],
)

_calculations_service = FinancialCalculationsService()
_reasoning_service = FinancialReasoningService()


def get_calculations_service() -> FinancialCalculationsService:
    return _calculations_service


def get_reasoning_service() -> FinancialReasoningService:
    return _reasoning_service


def get_supabase_dependency() -> SupabaseClient:
    return get_supabase_client()


class DateRange:
    """Optional inclusive ``start_date`` / ``end_date`` query parameters."""

    def __init__(
        self,
        start_date: date | None = Query(None, description="Inclusive start, YYYY-MM-DD."),
        end_date: date | None = Query(None, description="Inclusive end, YYYY-MM-DD."),
    ) -> None:
        if start_date and end_date and start_date > end_date:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"error": "start_date must not be after end_date."},
            )
        self.start_date = start_date.isoformat() if start_date else None
        self.end_date = end_date.isoformat() if end_date else None


def _load_summary(
    supabase: SupabaseClient,
    calculations: FinancialCalculationsService,
    user_id: str,
    period: DateRange | None = None,
):
    period = period or DateRange()
    try:
        records = supabase.list_all_financial_records(
            user_id, start_date=period.start_date, end_date=period.end_date
        )
    except (SupabaseConfigurationError, SupabaseConnectionError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "Financial record storage is unavailable."},
        ) from exc
    return calculations.summarize(
        records, start_date=period.start_date, end_date=period.end_date
    )


@router.get(
    "/summary",
    response_model=FinancialSummary,
    summary="Get the deterministic spending summary without calling the LLM",
    description=(
        "Returns totals, category and month breakdowns, the month-end "
        "forecast and unusual-spending flags. Cheap to call: no LLM involved."
    ),
)
def get_summary(
    period: DateRange = Depends(),
    user: TokenUser = Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase_dependency),
    calculations: FinancialCalculationsService = Depends(get_calculations_service),
) -> FinancialSummary:
    return _load_summary(supabase, calculations, user.id, period)


@router.get(
    "",
    response_model=InsightsResponse,
    summary="Get a deterministic spending summary with AI-generated insights",
    description=(
        "Computes a deterministic spending summary from saved financial "
        "records, then asks the LLM to narrate insights and budgeting "
        "recommendations grounded in that summary. Every figure in the "
        "summary is computed deterministically; the LLM never invents "
        "numbers.\n\n"
        "Optional `start_date` / `end_date` (inclusive, YYYY-MM-DD) limit the "
        "summary to a period; every record in the range is used."
    ),
)
async def get_insights(
    period: DateRange = Depends(),
    user: TokenUser = Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase_dependency),
    calculations: FinancialCalculationsService = Depends(get_calculations_service),
    reasoning: FinancialReasoningService = Depends(get_reasoning_service),
) -> InsightsResponse:
    summary = _load_summary(supabase, calculations, user.id, period)

    try:
        generated = await reasoning.generate_insights(summary)
    except FinancialReasoningError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": str(exc)},
        ) from exc

    return InsightsResponse(
        summary=summary,
        headline=generated.get("headline", ""),
        insights=generated.get("insights", []),
        recommendations=generated.get("recommendations", []),
    )


@router.post(
    "/ask",
    response_model=AskResponse,
    summary="Ask a natural-language question about your finances",
    description=(
        "Answers a free-form question grounded only in the deterministic "
        "spending summary computed from saved financial records."
    ),
)
async def ask_insights(
    request: AskRequest,
    period: DateRange = Depends(),
    user: TokenUser = Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase_dependency),
    calculations: FinancialCalculationsService = Depends(get_calculations_service),
    reasoning: FinancialReasoningService = Depends(get_reasoning_service),
) -> AskResponse:
    if not request.question.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "question must not be blank."},
        )

    summary = _load_summary(supabase, calculations, user.id, period)

    try:
        generated = await reasoning.answer_question(summary, request.question)
    except FinancialReasoningError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": str(exc)},
        ) from exc

    return AskResponse(
        question=request.question,
        answer=generated.get("answer", ""),
    )
