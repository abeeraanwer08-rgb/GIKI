"""State carried between financial-document pipeline stages."""

from dataclasses import dataclass, field
from typing import Any, Optional

from schemas.receipt import (
    ImageQualityReport,
    ReceiptAnalysisResponse,
    ReceiptUploadResponse,
    ReceiptValidationReport,
)
from schemas.ufr import UniversalFinancialRecord
from schemas.review_response import ReviewResponse
from services.document_classifier import DocumentClassificationResult
from services.confidence import ConfidenceResult
from schemas.ufr import ReviewHint


@dataclass
class PipelineContext:
    """Mutable processing state shared by all pipeline stages."""

    image_bytes: bytes
    filename: str
    content_type: str
    # Document type the user chose explicitly; skips the heuristic classifier.
    document_type_hint: Optional[str] = None

    quality_report: Optional[ImageQualityReport] = None
    classification: Optional[DocumentClassificationResult] = None
    document_type: Optional[str] = None
    parser_output: Optional[Any] = None
    legacy_receipt_output: Optional[ReceiptAnalysisResponse] = None
    validation_result: Optional[ReceiptValidationReport] = None
    universal_record: Optional[UniversalFinancialRecord] = None
    confidence_result: Optional[ConfidenceResult] = None
    review_hints: list[ReviewHint] = field(default_factory=list)
    review_response: Optional[ReviewResponse] = None
    warnings: list[str] = field(default_factory=list)
    final_response: Optional[ReceiptUploadResponse] = None