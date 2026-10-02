"""
Mappers for converting parser-specific output into Universal Financial Records.

The receipt mapper is the first adapter in this layer. Future document parsers
should add their own mapper methods here (or in focused mapper modules) while
returning the same UniversalFinancialRecord schema.
"""

from uuid import uuid4

from schemas.receipt import ReceiptAnalysisResponse
from schemas.ufr import (
    UniversalFinancialRecord,
    UniversalFinancialRecordItem,
    UniversalFinancialRecordMetadata,
)
from schemas.bank_statement import BankStatementAnalysisResponse
from schemas.wallet import WalletAnalysisResponse
from parsers.bank_statement_parser import BANK_STATEMENT_PARSER_VERSION
from parsers.wallet_parser import WALLET_PARSER_VERSION
from services.categorization import CategorizationService
from services.utility_bill_analysis import (
    UTILITY_BILL_PARSER_VERSION,
    UtilityBillAnalysisResponse,
)


CONFIDENCE_SCORES = {
    "high": 0.9,
    "medium": 0.6,
    "low": 0.3,
}


class UniversalFinancialRecordMapper:
    """Converts document parser responses into the canonical UFR schema."""

    def from_receipt_analysis(
        self,
        analysis: ReceiptAnalysisResponse,
        *,
        document_type: str = "receipt",
        source: str = "receipt_analysis",
        confidence: str | float | None = None,
        quality_score: int | None = None,
        parser_version: str = "receipt-parser-v1",
    ) -> UniversalFinancialRecord:
        """
        Map the existing receipt analysis response into a UFR.

        This adapter deliberately does not change the receipt analysis object.
        It creates a separate canonical record for downstream consumers.
        """
        if isinstance(confidence, str):
            confidence_value = CONFIDENCE_SCORES.get(confidence.lower())
        else:
            confidence_value = confidence

        items = [
            UniversalFinancialRecordItem(
                description=item.item_name,
                amount=item.total_price,
                quantity=item.quantity,
                unit_price=item.unit_price,
                category=item.category,
            )
            for item in (analysis.items or [])
        ]

        return UniversalFinancialRecord(
            record_id=str(uuid4()),
            document_type=document_type,
            merchant=analysis.merchant_name,
            document_date=analysis.purchase_date,
            currency=analysis.currency,
            total_amount=analysis.total_amount,
            # ReceiptAnalysisResponse does not currently extract payment method.
            payment_method=None,
            category=None,
            items=items,
            metadata=UniversalFinancialRecordMetadata(
                source=source,
                confidence=confidence_value,
                quality_score=quality_score,
                subtotal_amount=analysis.subtotal_amount,
                tax_amount=analysis.tax_amount,
                service_charge=analysis.service_charge,
                delivery_charge=analysis.delivery_charge,
                discount_amount=analysis.discount_amount,
                grand_total_amount=analysis.grand_total_amount,
                parser_version=parser_version,
            ),
        )

    def from_utility_bill_analysis(
        self,
        analysis: UtilityBillAnalysisResponse,
        *,
        confidence: str | float | None = None,
        quality_score: int | None = None,
    ) -> UniversalFinancialRecord:
        """Map utility-specific extraction into the unchanged generic UFR."""
        if isinstance(confidence, str):
            confidence_value = CONFIDENCE_SCORES.get(confidence.lower())
        else:
            confidence_value = confidence

        utility_metadata = {
            "consumer_number": analysis.consumer_number,
            "billing_period": analysis.billing_period,
            "issue_date": analysis.issue_date,
            "due_date": analysis.due_date,
        }
        items = []
        if analysis.bill_type or analysis.amount_due is not None:
            items.append(
                UniversalFinancialRecordItem(
                    description=analysis.bill_type or "Utility bill",
                    amount=analysis.amount_due,
                    category="utilities",
                    metadata=utility_metadata,
                )
            )

        return UniversalFinancialRecord(
            record_id=str(uuid4()),
            document_type="utility_bill",
            merchant=analysis.provider,
            document_date=analysis.issue_date,
            currency=analysis.currency,
            total_amount=analysis.amount_due,
            payment_method=None,
            category="utilities",
            items=items,
            metadata=UniversalFinancialRecordMetadata(
                source="utility_bill_analysis",
                confidence=confidence_value,
                quality_score=quality_score,
                parser_version=UTILITY_BILL_PARSER_VERSION,
            ),
        )

    def from_wallet_analysis(
        self,
        analysis: WalletAnalysisResponse,
        *,
        confidence: str | float | None = None,
        quality_score: int | None = None,
    ) -> UniversalFinancialRecord:
        """Map wallet-specific extraction into the unchanged generic UFR."""
        if isinstance(confidence, str):
            confidence_value = CONFIDENCE_SCORES.get(confidence.lower())
        else:
            confidence_value = confidence

        wallet_metadata = {
            "wallet_name": analysis.wallet_name,
            "transaction_type": analysis.transaction_type,
            "counterparty": analysis.counterparty,
            "transaction_time": analysis.transaction_time,
            "transaction_reference": analysis.transaction_reference,
        }
        items = []
        if analysis.amount is not None or analysis.transaction_type:
            items.append(
                UniversalFinancialRecordItem(
                    description=analysis.transaction_type or "Wallet transaction",
                    amount=analysis.amount,
                    category="wallet",
                    metadata=wallet_metadata,
                )
            )

        return UniversalFinancialRecord(
            record_id=str(uuid4()),
            document_type="wallet_screenshot",
            merchant=analysis.wallet_name,
            document_date=analysis.transaction_date,
            currency=analysis.currency,
            total_amount=analysis.amount,
            payment_method=None,
            category="wallet",
            items=items,
            metadata=UniversalFinancialRecordMetadata(
                source="wallet_analysis",
                confidence=confidence_value,
                quality_score=quality_score,
                parser_version=WALLET_PARSER_VERSION,
            ),
        )

    def from_bank_statement_analysis(
        self,
        analysis: BankStatementAnalysisResponse,
        *,
        confidence: str | float | None = None,
        quality_score: int | None = None,
    ) -> UniversalFinancialRecord:
        """
        Map a statement into one UFR whose items are the *debits* (spending).

        Credits are money in, not spending, so they are summarised in
        ``metadata.details`` instead of becoming items. ``total_amount`` is the
        sum of the debit items, which keeps the persistence layer's item/total
        reconciliation consistent.
        """
        if isinstance(confidence, str):
            confidence_value = CONFIDENCE_SCORES.get(confidence.lower())
        else:
            confidence_value = confidence

        categorizer = CategorizationService()
        items: list[UniversalFinancialRecordItem] = []
        for txn in analysis.transactions:
            if not txn.debit or txn.debit <= 0:
                continue
            items.append(
                UniversalFinancialRecordItem(
                    description=txn.description or "Bank transaction",
                    amount=txn.debit,
                    category=categorizer.categorize(
                        document_type=None,
                        merchant=txn.description,
                    ).category,
                    metadata={
                        "date": txn.date,
                        "balance": txn.balance,
                        "reference": txn.reference,
                    },
                )
            )

        credits = [t for t in analysis.transactions if t.credit and t.credit > 0]
        dated = sorted(t.date for t in analysis.transactions if t.date)
        total_debits = round(sum(i.amount or 0.0 for i in items), 2)

        return UniversalFinancialRecord(
            record_id=str(uuid4()),
            document_type="bank_statement",
            merchant=analysis.bank_name,
            document_date=analysis.period_end or (dated[-1] if dated else None),
            currency=analysis.currency,
            total_amount=total_debits if items else None,
            payment_method="bank_transfer",
            category=None,
            items=items,
            metadata=UniversalFinancialRecordMetadata(
                source="bank_statement_analysis",
                confidence=confidence_value,
                quality_score=quality_score,
                parser_version=BANK_STATEMENT_PARSER_VERSION,
                details={
                    "account_last4": analysis.account_last4,
                    "period_start": analysis.period_start,
                    "period_end": analysis.period_end,
                    "opening_balance": analysis.opening_balance,
                    "closing_balance": analysis.closing_balance,
                    "debit_count": len(items),
                    "credit_count": len(credits),
                    "total_credits": round(sum(t.credit or 0.0 for t in credits), 2),
                },
            ),
        )
