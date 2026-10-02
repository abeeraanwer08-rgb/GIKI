"""Document classification stage."""

from services.document_classifier import (
    DocumentClassificationResult,
    DocumentClassifierService,
)
from services.pipeline.pipeline_context import PipelineContext
from services.pipeline.pipeline_result import PipelineResult


class ClassifierStage:
    """Runs the existing document classifier."""

    name = "classifier"

    def __init__(self, service: DocumentClassifierService):
        self.service = service

    def process(self, context: PipelineContext) -> PipelineResult:
        if context.document_type_hint:
            # The user knows what they are uploading; trust that over a heuristic.
            classification = DocumentClassificationResult(
                document_type=context.document_type_hint,
                confidence="high",
                notes="Document type chosen by the user.",
            )
        else:
            classification = self.service.classify_document(context.image_bytes)
        context.classification = classification
        context.document_type = classification.document_type
        return PipelineResult.ok(self.name, payload=classification)