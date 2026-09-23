"""
HissabAI services package.

Exports:
    ImageQualityService        — image quality checks (OpenCV)
    DocumentClassifierService  — lightweight financial document classifier
    ReceiptAnalysisService     — OpenAI Vision extraction
    NormalizationService       — canonical schema normalizer (pass-through for receipts)
    UniversalFinancialRecordMapper — parser output to canonical UFR mapping
    UtilityBillAnalysisService — Pakistani utility-bill Vision extraction
    WalletParser              — EasyPaisa/JazzCash wallet Vision extraction
    ParserRegistry           — centralized document parser selection
    ReceiptValidationService   — extracted-data validation
    ConfidenceService        — deterministic UFR confidence scoring
    ReviewHintService        — deterministic field-level review hints
    ReviewResponseBuilder    — Android review-screen response builder
"""

from services.document_classifier import DocumentClassifierService
from services.image_quality import ImageQualityService
from services.normalization import NormalizationService
from services.receipt_analysis import ReceiptAnalysisService
from services.ufr_mapper import UniversalFinancialRecordMapper
from services.utility_bill_analysis import UtilityBillAnalysisService
from services.parsers.parser_registry import ParserRegistry
from parsers.wallet_parser import WalletParser
from services.confidence import ConfidenceService
from services.review_hints import ReviewHintService
from services.review_response_builder import ReviewResponseBuilder
from services.validation import ReceiptValidationService

__all__ = [
    "ImageQualityService",
    "DocumentClassifierService",
    "ReceiptAnalysisService",
    "NormalizationService",
    "UniversalFinancialRecordMapper",
    "UtilityBillAnalysisService",
    "ParserRegistry",
    "WalletParser",
    "ConfidenceService",
    "ReviewHintService",
    "ReviewResponseBuilder",
    "ReceiptValidationService",
]
