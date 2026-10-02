"""API routes for saving and listing user-approved financial records."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status

from schemas.financial_record import (
    FinancialRecordListResponse,
    FinancialRecordSaveResponse,
    to_summary,
)
from routes.auth import get_current_user
from schemas.ufr import UniversalFinancialRecord
from services.categorization import CategorizationService
from services.financial_record_persistence import (
    FinancialRecordPersistenceService,
    FinancialRecordTotalMismatchWarning,
    FinancialRecordValidationError,
)
from services.supabase_client import (
    SupabaseClient,
    SupabaseConfigurationError,
    SupabaseConflictError,
    SupabaseConnectionError,
    get_supabase_client,
)
from services.tokens import TokenUser

router = APIRouter(
    prefix="/api/v1/financial-records",
    tags=["Financial Records"],
)

_persistence_service = FinancialRecordPersistenceService()
_categorizer = CategorizationService()


def get_financial_record_persistence_service() -> FinancialRecordPersistenceService:
    """Provide the persistence service and keep the Supabase client lazy."""
    return _persistence_service


def get_supabase_dependency() -> SupabaseClient:
    return get_supabase_client()


@router.get(
    "",
    response_model=FinancialRecordListResponse,
    summary="List saved financial records",
    description=(
        "Returns one page of saved financial records, most recent first, "
        "shaped for a transaction list, with the total count and `has_more`. "
        "Filter with `start_date`/`end_date` (inclusive) and `category`; page "
        "with `limit`/`offset`. Returns HTTP 503 when persistence is "
        "unavailable."
    ),
)
def list_financial_records(
    limit: int = Query(50, ge=1, le=200, description="Page size."),
    offset: int = Query(0, ge=0, description="Records to skip."),
    start_date: date | None = Query(None, description="Inclusive start, YYYY-MM-DD."),
    end_date: date | None = Query(None, description="Inclusive end, YYYY-MM-DD."),
    category: str | None = Query(None, description="Only this category."),
    user: TokenUser = Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase_dependency),
) -> FinancialRecordListResponse:
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "start_date must not be after end_date."},
        )
    try:
        rows, total = supabase.list_financial_records_page(
            user.id,
            limit=limit,
            offset=offset,
            start_date=start_date.isoformat() if start_date else None,
            end_date=end_date.isoformat() if end_date else None,
            category=category.strip().lower() if category else None,
        )
    except (SupabaseConfigurationError, SupabaseConnectionError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "Financial record persistence is unavailable."},
        ) from exc

    return FinancialRecordListResponse(
        records=[to_summary(row, _categorizer.categorize_row(row)) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
        has_more=offset + len(rows) < total,
    )


@router.post(
    "",
    response_model=FinancialRecordSaveResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Save a user-approved financial record",
    description=(
        "Validates a reviewed UniversalFinancialRecord and inserts it into "
        "Supabase. This endpoint does not upload images, invoke OpenAI, or "
        "rerun document parsing.\n\n"
        "When totals do not reconcile after accounting for all known charges, "
        "returns HTTP 409 with error='total_mismatch'. The client may retry "
        "with metadata.confirm_total_mismatch=true to persist the record with "
        "review_required=True."
    ),
)
def save_financial_record(
    record: UniversalFinancialRecord,
    user: TokenUser = Depends(get_current_user),
    persistence_service: FinancialRecordPersistenceService = Depends(
        get_financial_record_persistence_service
    ),
) -> FinancialRecordSaveResponse:
    confirm = bool(record.metadata.confirm_total_mismatch)
    try:
        saved_count = persistence_service.save(
            record, user_id=user.id, confirm_total_mismatch=confirm
        )
    except FinancialRecordTotalMismatchWarning as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "total_mismatch",
                "message": str(exc),
                "confirm_key": "confirm_total_mismatch",
            },
        ) from exc
    except FinancialRecordValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "Invalid financial record",
                "errors": exc.errors,
            },
        ) from exc
    except SupabaseConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "Financial record already exists",
                "record_id": record.record_id,
            },
        ) from exc
    except (SupabaseConfigurationError, SupabaseConnectionError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "Financial record persistence is unavailable.",
            },
        ) from exc

    return FinancialRecordSaveResponse(
        saved=True,
        record_id=record.record_id,
        document_type=record.document_type,
        category=record.category,
        records_saved=saved_count,
    )
