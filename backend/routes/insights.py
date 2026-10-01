"""API routes for AI-generated financial insights and natural-language Q&A."""

from fastapi import APIRouter, Depends, HTTPException, status

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


def _load_summary(
    supabase: SupabaseClient, calculations: FinancialCalculationsService, user_id: str
):
    try:
        records = supabase.list_financial_records(user_id)
    except (SupabaseConfigurationError, SupabaseConnectionError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "Financial record storage is unavailable."},
        ) from exc
    return calculations.summarize(records)


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
    user: TokenUser = Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase_dependency),
    calculations: FinancialCalculationsService = Depends(get_calculations_service),
) -> FinancialSummary:
    return _load_summary(supabase, calculations, user.id)


@router.get(
    "",
    response_model=InsightsResponse,
    summary="Get a deterministic spending summary with AI-generated insights",
    description=(
        "Computes a deterministic spending summary from saved financial "
        "records, then asks the LLM to narrate insights and budgeting "
        "recommendations grounded in that summary. Every figure in the "
        "summary is computed deterministically; the LLM never invents "
        "numbers."
    ),
)
async def get_insights(
    user: TokenUser = Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase_dependency),
    calculations: FinancialCalculationsService = Depends(get_calculations_service),
    reasoning: FinancialReasoningService = Depends(get_reasoning_service),
) -> InsightsResponse:
    summary = _load_summary(supabase, calculations, user.id)

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

    summary = _load_summary(supabase, calculations, user.id)

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
