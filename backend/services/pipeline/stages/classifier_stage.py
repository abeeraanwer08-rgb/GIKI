"""Document classification stage."""

from services.ai_document_classifier import AIDocumentClassifier
from services.document_classifier import (
    DocumentClassificationResult,
    DocumentClassifierService,
)
from services.pipeline.pipeline_context import PipelineContext
from services.pipeline.pipeline_result import PipelineResult


class ClassifierStage:
    """Picks the document type: the user's choice, else heuristics, else the vision model."""

    name = "classifier"

    def __init__(
        self,
        service: DocumentClassifierService,
        ai_classifier: AIDocumentClassifier | None = None,
    ):
        self.service = service
        self.ai_classifier = ai_classifier

    def _heuristic(self, context: PipelineContext) -> DocumentClassificationResult:
        if context.document_type_hint:
            # The user knows what they are uploading; trust that over any guess.
            return DocumentClassificationResult(
                document_type=context.document_type_hint,
                confidence="high",
                notes="Document type chosen by the user.",
            )
        return self.service.classify_document(context.image_bytes)

    def _finish(self, context: PipelineContext, classification: DocumentClassificationResult) -> PipelineResult:
        context.classification = classification
        context.document_type = classification.document_type
        return PipelineResult.ok(self.name, payload=classification)

    def process(self, context: PipelineContext) -> PipelineResult:
        """Hint or heuristics only (no network)."""
        return self._finish(context, self._heuristic(context))

    async def classify(self, context: PipelineContext) -> PipelineResult:
        """As ``process``, then let the vision model overrule an unsure heuristic.

        The heuristic's default is a "medium" receipt, which is exactly where
        invoices and statements hide, so anything short of "high" is double-checked.
        The model's answer is only used when it is itself "high" confidence.
        """
        classification = self._heuristic(context)
        if (
            not context.document_type_hint
            and classification.confidence != "high"
            and self.ai_classifier is not None
        ):
            ai = await self.ai_classifier.classify(context.image_bytes)
            if ai is not None and ai.confidence == "high":
                classification = ai
        return self._finish(context, classification)
