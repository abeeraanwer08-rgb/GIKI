"""Receipt validation stage."""

from services.pipeline.pipeline_context import PipelineContext
from services.pipeline.pipeline_result import PipelineResult
from services.validation import ReceiptValidationService
from services.utility_bill_analysis import (
    UtilityBillAnalysisResponse,
    UtilityBillAnalysisService,
)
from parsers.bank_statement_parser import BankStatementParser
from parsers.wallet_parser import WalletParser
from schemas.bank_statement import BankStatementAnalysisResponse
from schemas.wallet import WalletAnalysisResponse


class ValidationStage:
    """Runs the existing validation service."""

    name = "validation"

    def __init__(
        self,
        service: ReceiptValidationService,
        utility_bill_service: UtilityBillAnalysisService | None = None,
        wallet_parser: WalletParser | None = None,
        bank_statement_parser: BankStatementParser | None = None,
    ):
        self.service = service
        self.utility_bill_service = utility_bill_service or UtilityBillAnalysisService()
        self.wallet_parser = wallet_parser or WalletParser()
        self.bank_statement_parser = bank_statement_parser or BankStatementParser()

    def process(self, context: PipelineContext) -> PipelineResult:
        if context.parser_output is None:
            return PipelineResult.fail(
                self.name,
                errors=["Parser output is missing."],
                http_status_code=500,
            )

        if (
            context.document_type == "utility_bill"
            and isinstance(context.parser_output, UtilityBillAnalysisResponse)
        ):
            validation = self.utility_bill_service.validate(context.parser_output)
        elif (
            context.document_type == "wallet_screenshot"
            and isinstance(context.parser_output, WalletAnalysisResponse)
        ):
            validation = self.wallet_parser.validate(context.parser_output)
        elif (
            context.document_type == "bank_statement"
            and isinstance(context.parser_output, BankStatementAnalysisResponse)
        ):
            validation = self.bank_statement_parser.validate(context.parser_output)
        else:
            validation = self.service.validate_receipt(context.parser_output)
        context.validation_result = validation
        return PipelineResult.ok(self.name, payload=validation, warnings=validation.warnings)