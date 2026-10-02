"""Financial document pipeline orchestrator."""

import asyncio

from schemas.receipt import ImageQualityReport, ReceiptUploadResponse
from services.ai_document_classifier import AIDocumentClassifier
from services.document_classifier import DocumentClassifierService
from services.image_quality import ImageQualityService
from services.normalization import NormalizationService
from services.pipeline.pipeline_context import PipelineContext
from services.pipeline.pipeline_result import PipelineResult
from services.pipeline.stages.classifier_stage import ClassifierStage
from services.pipeline.stages.confidence_stage import ConfidenceStage
from services.pipeline.stages.parser_stage import ParserStage
from services.pipeline.stages.quality_stage import QualityStage
from services.pipeline.stages.review_hints_stage import ReviewHintsStage
from services.pipeline.stages.ufr_stage import UFRStage
from services.pipeline.stages.validation_stage import ValidationStage
from services.parsers.parser_registry import ParserRegistry
from services.receipt_analysis import ReceiptAnalysisService
from services.ufr_mapper import UniversalFinancialRecordMapper
from services.validation import ReceiptValidationService
from services.utility_bill_analysis import UtilityBillAnalysisService
from parsers.bank_statement_parser import BankStatementParser
from parsers.invoice_parser import InvoiceParser
from parsers.wallet_parser import WalletParser
from services.confidence import ConfidenceService
from services.review_hints import ReviewHintService
from services.review_response_builder import ReviewResponseBuilder


MAX_PARALLEL_PAGE_READS = 3


class FinancialPipeline:
    """Executes financial document processing stages in a fixed order."""

    def __init__(
        self,
        *,
        quality_service: ImageQualityService | None = None,
        classifier_service: DocumentClassifierService | None = None,
        ai_classifier: AIDocumentClassifier | None = None,
        receipt_service: ReceiptAnalysisService | None = None,
        normalization_service: NormalizationService | None = None,
        validation_service: ReceiptValidationService | None = None,
        ufr_mapper: UniversalFinancialRecordMapper | None = None,
        utility_bill_service: UtilityBillAnalysisService | None = None,
        wallet_parser: WalletParser | None = None,
        bank_statement_parser: BankStatementParser | None = None,
        invoice_parser: InvoiceParser | None = None,
        confidence_service: ConfidenceService | None = None,
        review_hint_service: ReviewHintService | None = None,
        review_response_builder: ReviewResponseBuilder | None = None,
        parser_registry: ParserRegistry | None = None,
    ):
        quality_service = quality_service or ImageQualityService()
        classifier_service = classifier_service or DocumentClassifierService()
        receipt_service = receipt_service or ReceiptAnalysisService()
        normalization_service = normalization_service or NormalizationService()
        validation_service = validation_service or ReceiptValidationService()
        ufr_mapper = ufr_mapper or UniversalFinancialRecordMapper()
        utility_bill_service = utility_bill_service or UtilityBillAnalysisService()
        wallet_parser = wallet_parser or WalletParser()
        bank_statement_parser = bank_statement_parser or BankStatementParser()
        invoice_parser = invoice_parser or InvoiceParser()
        confidence_service = confidence_service or ConfidenceService()
        review_hint_service = review_hint_service or ReviewHintService()
        review_response_builder = review_response_builder or ReviewResponseBuilder()
        parser_registry = parser_registry or ParserRegistry(
            receipt_parser=receipt_service,
            utility_bill_parser=utility_bill_service,
            wallet_parser=wallet_parser,
            bank_statement_parser=bank_statement_parser,
            invoice_parser=invoice_parser,
            normalization_service=normalization_service,
        )

        self.quality_stage = QualityStage(quality_service)
        self.classifier_stage = ClassifierStage(
            classifier_service, ai_classifier or AIDocumentClassifier()
        )
        self.parser_stage = ParserStage(parser_registry)
        self.validation_stage = ValidationStage(
            validation_service,
            utility_bill_service,
            wallet_parser,
            bank_statement_parser,
            invoice_parser,
        )
        self.ufr_stage = UFRStage(ufr_mapper)
        self.confidence_stage = ConfidenceStage(confidence_service)
        self.review_hints_stage = ReviewHintsStage(review_hint_service)
        self.review_response_builder = review_response_builder

    async def process(self, context: PipelineContext) -> PipelineResult:
        """Run the pipeline and return a result containing the legacy response."""
        result = self.quality_stage.process(context)
        if not result.success:
            return result

        result = await self.classifier_stage.classify(context)
        if not result.success:
            return result

        result = await self.parser_stage.process(context)
        if not result.success:
            return result

        return self._finish(context)

    async def process_pages(
        self,
        pages: list[tuple[bytes, str]],
        filename: str,
        document_type_hint: str | None = None,
    ) -> PipelineResult:
        """Process a document that spans several page images, given as (bytes, content type) (a PDF or several photos).

        Every page must pass the image-quality check; the pages are then read in
        parallel by the document's parser and merged into one result, which runs
        through the same validation, mapping, confidence and review stages as a
        single image. Only document types whose parser registers ``merge_pages``
        (bank statements, invoices) can span pages.
        """
        contexts = [
            PipelineContext(
                image_bytes=data,
                filename=filename,
                content_type=content_type,
                document_type_hint=document_type_hint,
            )
            for data, content_type in pages
        ]

        # Classify first: the page-aware quality thresholds (a white A4 page is
        # not "overexposed") depend on the document type.
        context = contexts[0]
        result = await self.classifier_stage.classify(context)
        if not result.success:
            return result

        document_type = context.document_type or ""
        registration = self.parser_stage.parser_registry.get_registration(document_type)
        if registration is None or registration.merge_pages is None:
            return PipelineResult.fail(
                "classifier",
                errors=[f"Multiple pages are not supported for: {document_type}"],
                payload={
                    "error": "multi_page_unsupported",
                    "document_type": document_type,
                    "message": (
                        "Files with several pages are supported for bank statements and "
                        "invoices. Choose the document type, or upload a single page."
                    ),
                },
                http_status_code=422,
            )

        for number, page_context in enumerate(contexts, start=1):
            page_context.document_type_hint = document_type
            result = self.quality_stage.process(page_context)
            if not result.success:
                errors = [f"Page {number}: {error}" for error in result.errors]
                payload = dict(result.payload or {})
                payload.update(error="Image quality check failed", page=number, errors=errors)
                return PipelineResult.fail("quality", errors=errors, payload=payload, http_status_code=400)

        gate = asyncio.Semaphore(MAX_PARALLEL_PAGE_READS)

        async def read(page_context: PipelineContext):
            async with gate:
                return await registration.parser.process_bytes(
                    page_context.image_bytes, page_context.filename, page_context.content_type
                )

        parsed = [registration.normalize(page) for page in await asyncio.gather(*(read(c) for c in contexts))]
        merged = registration.merge_pages(parsed)
        context.parser_output = merged
        context.legacy_receipt_output = registration.to_legacy_response(merged)
        context.quality_report = self._merge_quality([c.quality_report for c in contexts])
        return self._finish(context)

    @staticmethod
    def _merge_quality(reports: list[ImageQualityReport | None]) -> ImageQualityReport:
        present = [(n, r) for n, r in enumerate(reports, start=1) if r is not None]
        return ImageQualityReport(
            passed=True,
            warnings=[f"Page {n}: {w}" for n, r in present for w in r.warnings],
            errors=[],
            is_long_receipt=False,
            quality_score=min((r.quality_score for _, r in present), default=0),
        )

    def _finish(self, context: PipelineContext) -> PipelineResult:
        """Validation → record → confidence → hints → review response."""
        result = self.validation_stage.process(context)
        if not result.success:
            return result

        result = self.ufr_stage.process(context)
        if not result.success:
            return result

        result = self.confidence_stage.process(context)
        if not result.success:
            return result

        result = self.review_hints_stage.process(context)
        if not result.success:
            return result

        if (
            context.quality_report is None
            or context.parser_output is None
            or context.validation_result is None
            or context.legacy_receipt_output is None
        ):
            return PipelineResult.fail(
                "response",
                errors=["Pipeline completed without all response fields."],
                http_status_code=500,
            )

        legacy_response = ReceiptUploadResponse(
            status=context.legacy_receipt_output.status,
            quality=context.quality_report,
            validation=context.validation_result,
            receipt=context.legacy_receipt_output,
        )
        context.final_response = legacy_response
        context.review_response = self.review_response_builder.build(
            record=context.universal_record,
            validation_results=context.validation_result,
            confidence_results=context.confidence_result,
            review_hints=context.review_hints,
            original_image_reference=context.filename,
            processing_metadata={"content_type": context.content_type},
            quality_report=context.quality_report,
            legacy_response=legacy_response,
        )
        return PipelineResult.ok("response", payload=context.review_response)