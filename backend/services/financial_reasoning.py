"""AI financial reasoning over a deterministic spending summary.

This service never computes totals itself and never sees raw record rows —
it only reasons in natural language over the FinancialSummary produced by
FinancialCalculationsService. That keeps every number the user sees
deterministic and auditable; the LLM is responsible only for insights,
narrative, and answering free-form questions grounded in those numbers.
"""

import json
import logging
import os

from openai import AsyncOpenAI, OpenAIError

from services.financial_calculations import FinancialSummary

logger = logging.getLogger(__name__)

INSIGHTS_SYSTEM_PROMPT = """You are KharchAI's financial copilot for users in Pakistan.
You will be given a JSON spending summary already computed deterministically
from the user's saved financial records. Do not invent or recompute numbers;
only reference the figures you are given.

Return ONLY a valid JSON object — no markdown, no explanation — matching:
{
  "headline": "<one short sentence summarizing spending this period>",
  "insights": ["<short observation about spending patterns>", ...],
  "recommendations": ["<short, actionable budgeting suggestion>", ...]
}

Rules:
- Ground every insight and recommendation in the provided summary figures.
- Prefer concrete category/merchant/month names from the summary over vague language.
- Return 2-4 insights and 2-4 recommendations.
- Amounts are in the summary's currency; do not convert currencies.
- If the summary has no records, say so plainly instead of fabricating patterns."""

ASK_SYSTEM_PROMPT = """You are KharchAI's financial copilot for users in Pakistan.
You will be given a JSON spending summary already computed deterministically
from the user's saved financial records, and a question from the user.

Answer ONLY using the figures in the provided summary. If the summary does not
contain enough information to answer, say so instead of guessing.

Return ONLY a valid JSON object — no markdown, no explanation — matching:
{
  "answer": "<direct answer to the user's question, 1-3 sentences>"
}"""


class FinancialReasoningError(RuntimeError):
    """Raised when the AI reasoning layer cannot produce a response."""


class FinancialReasoningService:
    """Responsible for LLM-generated insights and Q&A over financial summaries."""

    MODEL = "gpt-4.1-mini"

    def __init__(self) -> None:
        api_key = os.environ.get("OPENAI_API_KEY")
        self._client = AsyncOpenAI(api_key=api_key) if api_key else None

    async def generate_insights(self, summary: FinancialSummary) -> dict:
        return await self._complete(
            system_prompt=INSIGHTS_SYSTEM_PROMPT,
            user_content=summary.model_dump_json(),
        )

    async def answer_question(self, summary: FinancialSummary, question: str) -> dict:
        payload = {
            "summary": summary.model_dump(mode="json"),
            "question": question,
        }
        return await self._complete(
            system_prompt=ASK_SYSTEM_PROMPT,
            user_content=json.dumps(payload),
        )

    async def _complete(self, *, system_prompt: str, user_content: str) -> dict:
        if self._client is None:
            raise FinancialReasoningError(
                "OPENAI_API_KEY is not configured; AI reasoning is unavailable."
            )

        try:
            response = await self._client.chat.completions.create(
                model=self.MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content},
                ],
                response_format={"type": "json_object"},
            )
        except OpenAIError as exc:
            logger.error("OpenAI request failed during financial reasoning: %s", exc)
            raise FinancialReasoningError(
                "The AI reasoning service is temporarily unavailable."
            ) from exc

        content = response.choices[0].message.content
        try:
            return json.loads(content)
        except (TypeError, json.JSONDecodeError) as exc:
            logger.error("Financial reasoning returned non-JSON content: %r", content)
            raise FinancialReasoningError(
                "The AI reasoning service returned an unexpected response."
            ) from exc
