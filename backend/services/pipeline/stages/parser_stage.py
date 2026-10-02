"""Document parser dispatch stage."""

from services.pipeline.pipeline_context import PipelineContext
from services.pipeline.pipeline_result import PipelineResult
from services.parsers.parser_registry import ParserRegistry


def parser_failure(parsed, stage_name: str = "parser") -> PipelineResult | None:
    """Turn a parser's own ``status="error"`` into a real HTTP error.

    Without this a missing OpenAI key or a model failure looked like a successful
    scan with every field blank. 503 = the AI is not configured, 502 = it failed.
    """
    if getattr(parsed, "status", None) != "error":
        return None
    message = str(getattr(parsed, "message", "") or "The document could not be read.")
    not_configured = "not configured" in message
    return PipelineResult.fail(
        stage_name,
        errors=[message],
        payload={
            "error": "AI reading is not configured" if not_configured else "The document could not be read",
            "message": (
                "The server has no OpenAI API key, so documents cannot be read yet. Add OPENAI_API_KEY to the backend's .env."
                if not_configured
                else "The AI service could not read this document. Please try again."
            ),
        },
        http_status_code=503 if not_configured else 502,
    )


class ParserStage:
    """
    Dispatches parser work by document type.

    Parser selection is delegated to ParserRegistry. This stage only executes
    the resolved parser and its registered adapters.
    """

    name = "parser"

    def __init__(
        self,
        parser_registry: ParserRegistry,
    ):
        self.parser_registry = parser_registry

    async def process(self, context: PipelineContext) -> PipelineResult:
        document_type = context.document_type or ""
        registration = self.parser_registry.get_registration(document_type)
        if registration is None:
            return PipelineResult.fail(
                self.name,
                errors=[f"No parser registered for document type: {context.document_type}"],
                payload={
                    "status": "unsupported_document",
                    "document_type": context.document_type,
                    "message": "This document type is planned but not yet supported.",
                },
                http_status_code=400,
            )

        parsed = await registration.parser.process_bytes(
            context.image_bytes,
            context.filename,
            context.content_type,
        )
        failure = parser_failure(parsed, self.name)
        if failure is not None:
            return failure
        parsed = registration.normalize(parsed)
        context.parser_output = parsed
        context.legacy_receipt_output = registration.to_legacy_response(parsed)
        return PipelineResult.ok(self.name, payload=parsed)