"""Vision-model document classifier, used when the heuristics are not sure.

The image heuristics in ``document_classifier.py`` cannot tell an invoice or a
bank statement from a receipt (they only see shapes and colours). This asks the
vision model one cheap question — "what kind of document is this?" — on a small
copy of the image. It only overrides the heuristics when the model is confident,
and any failure falls back to them, so it can never make uploads fail.
"""

from __future__ import annotations

import base64
import json
import logging
import os

import cv2
import numpy as np
from openai import AsyncOpenAI

from services.document_classifier import DocumentClassificationResult

logger = logging.getLogger(__name__)

LABELS = {"receipt", "invoice", "bank_statement", "utility_bill", "wallet_screenshot"}
MAX_SIDE = 1024

PROMPT = """You classify photos of financial documents from Pakistan.
Return ONLY a JSON object: {"document_type": "<label>", "confidence": "high|medium|low"}
where <label> is exactly one of:
- receipt: a shop, restaurant or fuel point-of-sale receipt
- invoice: a formal business invoice or tax invoice with an invoice number, vendor and line items
- bank_statement: a bank account statement listing dated transactions with debit/credit/balance columns
- utility_bill: an electricity, gas, water, phone or internet bill
- wallet_screenshot: a mobile wallet (EasyPaisa, JazzCash, bank app) transaction screenshot
- unknown: anything else
Use "high" only when you are sure."""


def _thumbnail(image_bytes: bytes) -> bytes | None:
    image = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        return None
    height, width = image.shape[:2]
    scale = MAX_SIDE / max(height, width)
    if scale < 1:
        image = cv2.resize(image, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_AREA)
    ok, jpeg = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 80])
    return jpeg.tobytes() if ok else None


class AIDocumentClassifier:
    MODEL = "gpt-4.1-mini"

    def __init__(self) -> None:
        api_key = os.environ.get("OPENAI_API_KEY")
        enabled = os.environ.get("AI_CLASSIFIER", "on").strip().lower() not in {"off", "0", "false", "no"}
        self._client = AsyncOpenAI(api_key=api_key) if api_key and enabled else None

    @property
    def enabled(self) -> bool:
        return self._client is not None

    async def classify(self, image_bytes: bytes) -> DocumentClassificationResult | None:
        """The model's label, or ``None`` when disabled, unsure, or anything goes wrong."""
        if not self._client:
            return None
        thumb = _thumbnail(image_bytes)
        if thumb is None:
            return None
        data_url = f"data:image/jpeg;base64,{base64.b64encode(thumb).decode('utf-8')}"
        try:
            response = await self._client.chat.completions.create(
                model=self.MODEL,
                messages=[
                    {"role": "system", "content": PROMPT},
                    {
                        "role": "user",
                        "content": [
                            {"type": "image_url", "image_url": {"url": data_url, "detail": "low"}},
                            {"type": "text", "text": "What kind of document is this?"},
                        ],
                    },
                ],
                max_tokens=60,
                timeout=20,
                response_format={"type": "json_object"},
            )
            data = json.loads(response.choices[0].message.content or "{}")
        except Exception:  # noqa: BLE001 — classification is best-effort by design
            logger.warning("AI document classification failed; using heuristics.", exc_info=True)
            return None

        label = str(data.get("document_type", "")).strip().lower()
        confidence = str(data.get("confidence", "")).strip().lower()
        if label not in LABELS or confidence not in {"high", "medium", "low"}:
            return None
        return DocumentClassificationResult(
            document_type=label,
            confidence=confidence,
            notes=f"Vision model classified this as {label} ({confidence} confidence).",
        )
