"""Image quality stage."""

from services.image_quality import ImageQualityService
from services.pipeline.pipeline_context import PipelineContext
from services.pipeline.pipeline_result import PipelineResult


class QualityStage:
    """Runs the existing image quality service without duplicating its logic."""

    name = "quality"

    def __init__(self, service: ImageQualityService):
        self.service = service

    def process(self, context: PipelineContext) -> PipelineResult:
        quality = self.service.validate_image(
            context.image_bytes, context.document_type_hint
        )
        context.quality_report = quality

        if not quality.passed:
            return PipelineResult.fail(
                self.name,
                errors=quality.errors,
                payload={
                    "error": "Image quality check failed",
                    "quality": quality.model_dump(),
                },
                http_status_code=400,
            )

        context.warnings.extend(quality.warnings)
        return PipelineResult.ok(self.name, payload=quality, warnings=quality.warnings)