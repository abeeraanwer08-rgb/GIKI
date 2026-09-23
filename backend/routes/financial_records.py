"""API routes for saving and listing user-approved financial records."""

from fastapi import APIRouter, Depends, HTTPException, status

from schemas.financial_record import (
    FinancialRecordListResponse,
    FinancialRecordSaveResponse,
    to_summary,
)
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
        "Returns saved financial records, most recent first, shaped for a "
        "mobile transaction list. Returns HTTP 503 when persistence is "
        "unavailable."
    ),
)
def list_financial_records(
    supabase: SupabaseClient = Depends(get_supabase_dependency),
) -> FinancialRecordListResponse:
    try:
        rows = supabase.list_financial_records()
    except (SupabaseConfigurationError, SupabaseConnectionError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "Financial record persistence is unavailable."},
        ) from exc

    return FinancialRecordListResponse(
        records=[to_summary(row, _categorizer.categorize_row(row)) for row in rows]
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
    persistence_service: FinancialRecordPersistenceService = Depends(
        get_financial_record_persistence_service
    ),
) -> FinancialRecordSaveResponse:
    confirm = bool(record.metadata.confirm_total_mismatch)
    try:
        persistence_service.save(record, confirm_total_mismatch=confirm)
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
    )
