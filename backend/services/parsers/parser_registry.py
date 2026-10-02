"""
Central registry for financial document parsers.

The registry owns parser selection, while the parser implementations remain in
their existing service modules. Registering a future parser requires one
registry registration and, when needed, its document-specific normalization
and legacy-response adapters.
"""

from dataclasses import dataclass
from typing import Any, Callable, Optional, Protocol

from schemas.receipt import ReceiptAnalysisResponse
from parsers.bank_statement_parser import BankStatementParser
from parsers.wallet_parser import WalletParser
from services.normalization import NormalizationService
from services.receipt_analysis import ReceiptAnalysisService
from services.utility_bill_analysis import (
    UtilityBillAnalysisResponse,
    UtilityBillAnalysisService,
)


class ParserService(Protocol):
    """Common interface required by parsers registered in the pipeline."""

    async def process_bytes(
        self,
        image_bytes: bytes,
        filename: str,
        content_type: str,
    ) -> Any:
        ...


ParserNormalizer = Callable[[Any], Any]
LegacyResponseAdapter = Callable[[Any], ReceiptAnalysisResponse]


@dataclass(frozen=True)
class ParserRegistration:
    """Parser plus the adapters needed by the shared pipeline boundary."""

    parser: ParserService
    normalize: ParserNormalizer
    to_legacy_response: LegacyResponseAdapter


class ParserRegistry:
    """
    Resolves document types to their parser services.

    ``get_parser`` intentionally returns ``None`` for unknown types. The parser
    stage turns that controlled lookup miss into the existing unsupported-
    document HTTP error instead of allowing a KeyError or import failure to
    escape.
    """

    def __init__(
        self,
        *,
        receipt_parser: ReceiptAnalysisService | None = None,
        utility_bill_parser: UtilityBillAnalysisService | None = None,
        wallet_parser: WalletParser | None = None,
        bank_statement_parser: BankStatementParser | None = None,
        normalization_service: NormalizationService | None = None,
    ):
        normalization_service = normalization_service or NormalizationService()
        receipt_parser = receipt_parser or ReceiptAnalysisService()
        utility_bill_parser = utility_bill_parser or UtilityBillAnalysisService()
        wallet_parser = wallet_parser or WalletParser()
        bank_statement_parser = bank_statement_parser or BankStatementParser()

        self._registrations: dict[str, ParserRegistration] = {}
        self.register(
            "receipt",
            receipt_parser,
            normalize=lambda output: normalization_service.normalize(output, "receipt"),
            to_legacy_response=lambda output: output,
        )
        self.register(
            "utility_bill",
            utility_bill_parser,
            normalize=lambda output: output,
            to_legacy_response=utility_bill_parser.to_legacy_receipt_response,
        )
        self.register(
            "wallet_screenshot",
            wallet_parser,
            to_legacy_response=wallet_parser.to_legacy_receipt_response,
        )
        self.register(
            "bank_statement",
            bank_statement_parser,
            to_legacy_response=bank_statement_parser.to_legacy_receipt_response,
        )

    def register(
        self,
        document_type: str,
        parser: ParserService,
        *,
        normalize: ParserNormalizer | None = None,
        to_legacy_response: LegacyResponseAdapter | None = None,
    ) -> None:
        """
        Register or replace one document parser.

        Example future registration:

            registry.register("wallet_screenshot", WalletParser())

        A parser-specific normalizer or legacy adapter can be supplied when
        that parser's output needs more than the default identity projection.
        """
        self._registrations[document_type] = ParserRegistration(
            parser=parser,
            normalize=normalize or (lambda output: output),
            to_legacy_response=to_legacy_response or self._default_legacy_response,
        )

    def get_parser(self, document_type: str) -> Optional[ParserService]:
        """Return the parser for a document type, or ``None`` if unsupported."""
        registration = self._registrations.get(document_type)
        return registration.parser if registration else None

    def get_registration(self, document_type: str) -> Optional[ParserRegistration]:
        """Return the full parser registration for pipeline execution."""
        return self._registrations.get(document_type)

    @property
    def parsers(self) -> dict[str, ParserService]:
        """Return a snapshot of the registered document-type/parser mapping."""
        return {
            document_type: registration.parser
            for document_type, registration in self._registrations.items()
        }

    @staticmethod
    def _default_legacy_response(output: Any) -> ReceiptAnalysisResponse:
        """
        Default compatibility adapter for parser outputs already in the legacy
        receipt response schema.
        """
        if isinstance(output, ReceiptAnalysisResponse):
            return output
        raise TypeError(
            "Parser output requires a to_legacy_response adapter before it can "
            "be returned by the current upload API."
        )