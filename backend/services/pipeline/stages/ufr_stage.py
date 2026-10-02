"""Universal Financial Record stage."""

from services.pipeline.pipeline_context import PipelineContext
from services.pipeline.pipeline_result import PipelineResult
from services.ufr_mapper import UniversalFinancialRecordMapper
from services.utility_bill_analysis import UtilityBillAnalysisResponse
from schemas.bank_statement import BankStatementAnalysisResponse
from schemas.invoice import InvoiceAnalysisResponse
from schemas.wallet import WalletAnalysisResponse


class UFRStage:
    """Maps parser output into the canonical Universal Financial Record."""

    name = "ufr"

    def __init__(self, mapper: UniversalFinancialRecordMapper):
        self.mapper = mapper

    def process(self, context: PipelineContext) -> PipelineResult:
        if context.parser_output is None:
            return PipelineResult.fail(
                self.name,
                errors=["Parser output is missing."],
                http_status_code=500,
            )

        classification = context.classification
        confidence = classification.confidence if classification else None
        quality_score = (
            context.quality_report.quality_score if context.quality_report else None
        )
        if (
            context.document_type == "utility_bill"
            and isinstance(context.parser_output, UtilityBillAnalysisResponse)
        ):
            record = self.mapper.from_utility_bill_analysis(
                context.parser_output,
                confidence=confidence,
                quality_score=quality_score,
            )
        elif (
            context.document_type == "wallet_screenshot"
            and isinstance(context.parser_output, WalletAnalysisResponse)
        ):
            record = self.mapper.from_wallet_analysis(
                context.parser_output,
                confidence=confidence,
                quality_score=quality_score,
            )
        elif (
            context.document_type == "bank_statement"
            and isinstance(context.parser_output, BankStatementAnalysisResponse)
        ):
            record = self.mapper.from_bank_statement_analysis(
                context.parser_output,
                confidence=confidence,
                quality_score=quality_score,
            )
        elif (
            context.document_type == "invoice"
            and isinstance(context.parser_output, InvoiceAnalysisResponse)
        ):
            record = self.mapper.from_invoice_analysis(
                context.parser_output,
                confidence=confidence,
                quality_score=quality_score,
            )
        else:
            record = self.mapper.from_receipt_analysis(
                context.parser_output,
                document_type=context.document_type or "unknown",
                confidence=confidence,
                quality_score=quality_score,
            )
        context.universal_record = record
        return PipelineResult.ok(self.name, payload=record)