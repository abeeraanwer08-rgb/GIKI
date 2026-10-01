"""API routes for monthly category budgets."""

from typing import Callable

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from routes.auth import get_current_user
from services.budgets import BudgetOverview, BudgetService
from services.categorization import CATEGORIES
from services.supabase_client import (
    SupabaseClient,
    SupabaseConfigurationError,
    SupabaseConnectionError,
    get_supabase_client,
)
from services.tokens import TokenUser

router = APIRouter(prefix="/api/v1/budgets", tags=["Budgets"])

_budget_service = BudgetService()


class BudgetUpdate(BaseModel):
    monthly_limit: float = Field(gt=0, le=100_000_000)
    currency: str = "PKR"


def get_budget_service() -> BudgetService:
    return _budget_service


def get_supabase_dependency() -> SupabaseClient:
    return get_supabase_client()


def _validate_category(category: str) -> str:
    normalized = category.strip().lower()
    if normalized not in CATEGORIES:
        raise HTTPException(
            status_code=422,
            detail={"error": f"Unknown category '{category}'.", "categories": list(CATEGORIES)},
        )
    return normalized


def _with_storage(action: Callable[[], BudgetOverview]) -> BudgetOverview:
    try:
        return action()
    except (SupabaseConfigurationError, SupabaseConnectionError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "Budget storage is unavailable."},
        ) from exc


def _overview(supabase: SupabaseClient, service: BudgetService, user_id: str) -> BudgetOverview:
    return service.overview(supabase.list_budgets(user_id), supabase.list_financial_records(user_id))


@router.get(
    "",
    response_model=BudgetOverview,
    summary="Get this month's spending against each category budget",
)
def get_budgets(
    user: TokenUser = Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase_dependency),
    service: BudgetService = Depends(get_budget_service),
) -> BudgetOverview:
    return _with_storage(lambda: _overview(supabase, service, user.id))


@router.put(
    "/{category}",
    response_model=BudgetOverview,
    summary="Create or update the monthly budget for a category",
)
def set_budget(
    category: str,
    update: BudgetUpdate,
    user: TokenUser = Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase_dependency),
    service: BudgetService = Depends(get_budget_service),
) -> BudgetOverview:
    normalized = _validate_category(category)

    def action() -> BudgetOverview:
        supabase.upsert_budget(
            {
                "user_id": user.id,
                "category": normalized,
                "monthly_limit": update.monthly_limit,
                "currency": update.currency,
            }
        )
        return _overview(supabase, service, user.id)

    return _with_storage(action)


@router.delete(
    "/{category}",
    response_model=BudgetOverview,
    summary="Remove the budget for a category",
)
def delete_budget(
    category: str,
    user: TokenUser = Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase_dependency),
    service: BudgetService = Depends(get_budget_service),
) -> BudgetOverview:
    normalized = _validate_category(category)

    def action() -> BudgetOverview:
        supabase.delete_budget(user.id, normalized)
        return _overview(supabase, service, user.id)

    return _with_storage(action)
