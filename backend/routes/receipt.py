from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool

from routes.auth import get_current_user
from schemas.review_response import ReviewResponse
from services.pdf_pages import MAX_PAGES, PdfError, is_pdf, render_pdf_pages
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
ALLOWED_UPLOAD_TYPES = ALLOWED_IMAGE_TYPES | {"application/pdf"}

# Phone photos are typically 2-6 MB; anything far above this is not a receipt
# and would only waste vision-model tokens.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
# A multi-page upload (several photos, or a PDF) may carry more in total.
MAX_TOTAL_UPLOAD_BYTES = 25 * 1024 * 1024

# What the user may pick explicitly. Anything else (or "auto") uses the classifier.
SELECTABLE_DOCUMENT_TYPES = {"receipt", "invoice", "bank_statement", "utility_bill", "wallet_screenshot"}

_financial_pipeline = FinancialPipeline()


@router.post(
    "/upload",
    response_model=ReviewResponse,
    summary="Upload a financial document (image, several page images, or a PDF) for AI analysis",
    description=(
        "Accepts a financial document as an image (JPEG, PNG, GIF, WebP, BMP, TIFF) "
        "or a PDF. Send the `file` field more than once to upload the pages of one "
        "document in order. PDFs are rendered page by page (up to 12 pages). "
        "Several pages are supported for bank statements and invoices; other "
        "types take a single page.\n\n"
        "Pipeline: content-type check → image quality validation (every page) → "
        "document classification → OpenAI Vision extraction → merge pages → "
        "validation → JSON response.\n\n"
        "Requires sign-in. Returns HTTP 415 for unsupported MIME types, "
        "HTTP 413 for a file larger than 10 MB (25 MB in total), and HTTP 422 for an "
        "unusable PDF, more than 12 pages, or several pages of a type that "
        "does not allow it. Returns HTTP 400 if image quality fails (naming the page). "
        "Returns HTTP 400 with `status='unsupported_document'` if the image is "
        "not a supported document type. Receipts, invoices, bank statements, wallet "
        "screenshots and utility bills are supported. "
        "Send `document_type` (e.g. `bank_statement`) to skip auto-detection — "
        "recommended for statements and invoices."
    ),
)
async def upload_receipt(
    files: list[UploadFile] = File(..., alias="file"),
    document_type: str | None = Form(
        None,
        description=(
            "Optional: receipt, invoice, bank_statement, utility_bill or wallet_screenshot. "
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

    if len(files) > MAX_PAGES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "Too many pages", "max_pages": MAX_PAGES},
        )

    # ── 1. Content-type gate, then read each file once (capped) ───────────────
    pages: list[tuple[bytes, str]] = []
    total_bytes = 0
    for file in files:
        if file.content_type not in ALLOWED_UPLOAD_TYPES:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail={
                    "error": "Unsupported file type",
                    "received": file.content_type,
                    "allowed": sorted(ALLOWED_UPLOAD_TYPES),
                },
            )
        data = await file.read(MAX_UPLOAD_BYTES + 1)
        total_bytes += len(data)
        if len(data) > MAX_UPLOAD_BYTES or total_bytes > MAX_TOTAL_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail={
                    "error": "Image too large",
                    "max_megabytes": MAX_UPLOAD_BYTES // (1024 * 1024),
                    "max_total_megabytes": MAX_TOTAL_UPLOAD_BYTES // (1024 * 1024),
                },
            )

        # Trust the file's bytes, not its declared type, for what is a PDF.
        if is_pdf(data) or file.content_type == "application/pdf":
            if not is_pdf(data):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail={"error": "Unusable PDF", "message": "That file is not a valid PDF."},
                )
            try:
                rendered = await run_in_threadpool(render_pdf_pages, data)
            except PdfError as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail={"error": "Unusable PDF", "message": str(exc)},
                ) from exc
            pages.extend((png, "image/png") for png in rendered)
        else:
            pages.append((data, file.content_type))

    if len(pages) > MAX_PAGES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "Too many pages", "max_pages": MAX_PAGES},
        )

    filename = files[0].filename or "upload"
    if len(pages) == 1:
        image_bytes, content_type = pages[0]
        context = PipelineContext(
            image_bytes=image_bytes,
            filename=filename,
            content_type=content_type,
            document_type_hint=hint or None,
        )
        result = await _financial_pipeline.process(context)
    else:
        result = await _financial_pipeline.process_pages(pages, filename, hint or None)
    result.raise_for_http_error()
    return result.payload
