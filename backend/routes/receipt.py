from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from routes.auth import get_current_user
from schemas.review_response import ReviewResponse
from services.pipeline import FinancialPipeline, PipelineContext
from services.tokens import TokenUser

router = APIRouter(prefix="/api/v1/receipt", tags=["Receipt"])

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp",
    "image/tiff",
}

# Phone photos are typically 2-6 MB; anything far above this is not a receipt
# and would only waste vision-model tokens.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

# What the user may pick explicitly. Anything else (or "auto") uses the classifier.
SELECTABLE_DOCUMENT_TYPES = {"receipt", "bank_statement", "utility_bill", "wallet_screenshot"}

_financial_pipeline = FinancialPipeline()


@router.post(
    "/upload",
    response_model=ReviewResponse,
    summary="Upload a financial document image for AI analysis",
    description=(
        "Accepts a financial document image (JPEG, PNG, GIF, WebP, BMP, TIFF). "
        "Pipeline: content-type check → image quality validation → "
        "document classification → OpenAI Vision extraction → "
        "schema normalisation → receipt validation → JSON response.\n\n"
        "Requires sign-in. Returns HTTP 415 for unsupported MIME types and "
        "HTTP 413 for files larger than 10 MB. "
        "Returns HTTP 400 if image quality fails. "
        "Returns HTTP 400 with `status='unsupported_document'` if the image is "
        "not a supported document type. Receipts, bank statements, wallet "
        "screenshots and utility bills are supported; invoices are planned. "
        "Send `document_type` (e.g. `bank_statement`) to skip auto-detection — "
        "recommended for statements, which the automatic classifier can only "
        "guess at. "
        "On success, returns quality report, validation report, and extracted receipt data."
    ),
)
async def upload_receipt(
    file: UploadFile = File(...),
    document_type: str | None = Form(
        None,
        description=(
            "Optional: receipt, bank_statement, utility_bill or wallet_screenshot. "
            "Omit or send 'auto' to classify automatically."
        ),
    ),
    user: TokenUser = Depends(get_current_user),
):
    # ── 0. Optional explicit document type ────────────────────────────────────
    hint = (document_type or "").strip().lower()
    if hint in ("", "auto"):
        hint = ""
    elif hint not in SELECTABLE_DOCUMENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "Unknown document_type",
                "received": document_type,
                "allowed": sorted(SELECTABLE_DOCUMENT_TYPES) + ["auto"],
            },
        )

    # ── 1. Content-type gate ──────────────────────────────────────────────────
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={
                "error": "Unsupported file type",
                "received": file.content_type,
                "allowed": sorted(ALLOWED_IMAGE_TYPES),
            },
        )

    # ── 2. Read bytes once (reused by all services), capped ───────────────────
    image_bytes = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail={
                "error": "Image too large",
                "max_megabytes": MAX_UPLOAD_BYTES // (1024 * 1024),
            },
        )

    context = PipelineContext(
        image_bytes=image_bytes,
        filename=file.filename or "upload",
        content_type=file.content_type,
        document_type_hint=hint or None,
    )
    result = await _financial_pipeline.process(context)
    result.raise_for_http_error()
    return result.payload
