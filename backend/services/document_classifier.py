"""
Document Classifier Service — KharchAI Milestone 7A.1

Classifies an uploaded image into one of the supported financial document types.
This MVP implementation uses lightweight image heuristics (aspect ratio, file size,
colour distribution) as proxies.  A future version should replace this with an
AI-powered classifier (e.g. a small vision model fine-tuned on Pakistani financial
documents).

Supported document types
------------------------
    receipt           — point-of-sale receipt (supported by the full pipeline)
    invoice           — formal business invoice (found by the vision-model classifier
                        or chosen by the user; the image heuristics cannot see it)
    bank_statement    — printed/PDF bank statement page
    wallet_screenshot — mobile wallet / EasyPaisa / JazzCash screenshot
    utility_bill      — LESCO / SNGPL / WAPDA utility bill
    unknown           — cannot be classified with confidence
"""

import logging
from dataclasses import dataclass

import cv2
import numpy as np

logger = logging.getLogger(__name__)


# ── Result dataclass ──────────────────────────────────────────────────────────

@dataclass
class DocumentClassificationResult:
    document_type: str   # one of the supported types above
    confidence: str      # "high" | "medium" | "low"
    notes: str           # human-readable explanation (useful for debugging)


# ── Service ───────────────────────────────────────────────────────────────────

class DocumentClassifierService:
    """
    Lightweight heuristic document classifier.

    Analyses basic image properties — aspect ratio, mean brightness, colour
    variance, and file size — to infer the most likely document type.

    Extension points
    ----------------
    Each _detect_* helper method below is the correct place to plug in a more
    sophisticated detector for that document type (e.g. OCR keyword matching,
    logo detection, or an AI classifier call) without touching the rest of the
    pipeline.
    """

    # ── Public API ────────────────────────────────────────────────────────────

    def classify_document(self, image_bytes: bytes) -> DocumentClassificationResult:
        """
        Classify the document represented by ``image_bytes``.

        Args:
            image_bytes: Raw bytes of the uploaded image.

        Returns:
            DocumentClassificationResult with document_type, confidence, notes.
        """
        try:
            img = self._decode_image(image_bytes)
        except ValueError as exc:
            logger.warning("DocumentClassifier: could not decode image — %s", exc)
            return DocumentClassificationResult(
                document_type="unknown",
                confidence="low",
                notes=f"Image decode failed: {exc}",
            )

        h, w = img.shape[:2]
        aspect_ratio = h / w if w > 0 else 0
        file_size_kb = len(image_bytes) / 1024

        logger.debug(
            "DocumentClassifier: h=%d w=%d aspect=%.2f size_kb=%.1f",
            h, w, aspect_ratio, file_size_kb,
        )

        # Walk through detectors in priority order.
        # Each detector returns a result or None if it cannot make a confident call.

        # ── Wallet screenshot detector ─────────────────────────────────────────
        result = self._detect_wallet_screenshot(img, aspect_ratio, file_size_kb)
        if result:
            return result

        # ── Future plug-in point: utility_bill detector ───────────────────────
        result = self._detect_utility_bill(img, aspect_ratio, file_size_kb)
        if result:
            return result

        # ── Future plug-in point: bank_statement detector ─────────────────────
        result = self._detect_bank_statement(img, aspect_ratio, file_size_kb)
        if result:
            return result

        # ── Future plug-in point: invoice detector ────────────────────────────
        result = self._detect_invoice(img, aspect_ratio, file_size_kb)
        if result:
            return result

        # ── Default: assume receipt ───────────────────────────────────────────
        # Receipts come in many shapes; if none of the above detectors fired,
        # fall back to "receipt" with medium confidence.
        return DocumentClassificationResult(
            document_type="receipt",
            confidence="medium",
            notes=(
                f"No strong signal for another document type detected "
                f"(aspect={aspect_ratio:.2f}, size={file_size_kb:.1f} KB). "
                "Defaulting to receipt."
            ),
        )

    # ── Heuristic detectors (one per document type) ───────────────────────────
    # Each method returns a DocumentClassificationResult on a confident match,
    # or None to pass control to the next detector.

    def _detect_wallet_screenshot(
        self, img: np.ndarray, aspect_ratio: float, file_size_kb: float
    ):
        """
        Wallet screenshots (EasyPaisa, JazzCash, bank apps) tend to be:
          - Near-portrait smartphone aspect ratio (1.7 – 2.3)
          - High colour saturation (UI gradients / brand colours)
          - Moderate file size (50 – 500 KB)

        The MVP uses screenshot geometry, saturation, and edge density. OCR can
        strengthen this later without changing the classifier result contract.
        """
        if not (1.65 <= aspect_ratio <= 2.5):
            return None

        # Measure colour saturation in HSV space.
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        mean_saturation = float(np.mean(hsv[:, :, 1]))

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 50, 150)
        edge_ratio = float(np.count_nonzero(edges)) / float(img.shape[0] * img.shape[1])

        if mean_saturation > 45 and edge_ratio >= 0.003:
            return DocumentClassificationResult(
                document_type="wallet_screenshot",
                confidence="medium",
                notes=(
                    f"Smartphone aspect ratio ({aspect_ratio:.2f}) and high "
                    f"colour saturation ({mean_saturation:.1f}) with UI edge "
                    f"density ({edge_ratio:.4f}) suggest a wallet/app screenshot."
                ),
            )
        return None

    def _detect_bank_statement(
        self, img: np.ndarray, aspect_ratio: float, file_size_kb: float
    ):
        """
        Printed bank statements tend to be:
          - A4 landscape or portrait (aspect ~1.41 ± 0.15)
          - Predominantly white / very low colour saturation
          - Larger files (due to detail)

        TODO: OCR keyword check for "Statement of Account", "Balance B/F",
              "Debit", "Credit", bank name header.
        TODO: Table-structure detection (many horizontal lines).
        """
        if not (1.25 <= aspect_ratio <= 1.6):
            return None

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        mean_brightness = float(np.mean(gray))

        # Very white + A4-ish aspect is a weak bank-statement signal.
        if mean_brightness > 200 and file_size_kb > 200:
            return DocumentClassificationResult(
                document_type="bank_statement",
                confidence="low",
                notes=(
                    f"A4-ish aspect ratio ({aspect_ratio:.2f}) and high brightness "
                    f"({mean_brightness:.1f}) weakly suggest a bank statement. "
                    "Low confidence — needs OCR to confirm."
                ),
            )
        return None

    def _detect_utility_bill(
        self, img: np.ndarray, aspect_ratio: float, file_size_kb: float
    ):
        """
        Pakistani utility bills (LESCO, SNGPL, WAPDA) tend to be:
          - A4 portrait with header logos
          - Structured table layout
          - Government colour palettes (blues, greens)

        MVP uses a conservative visual proxy: A4-ish portrait layout, a
        structured page with horizontal table rules, and a blue/green header
        accent. OCR keyword matching should replace/strengthen this heuristic
        when an OCR or document-classification model is introduced.
        """
        if not (1.25 <= aspect_ratio <= 1.7) or file_size_kb < 20:
            return None

        height, width = img.shape[:2]
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # Utility providers commonly use blue or green branding in the top
        # header. Restrict the test to the header to avoid colorful item photos.
        header = hsv[: max(1, height // 4), :]
        blue_or_green = (
            (((header[:, :, 0] >= 35) & (header[:, :, 0] <= 130))
             & (header[:, :, 1] >= 55)
             & (header[:, :, 2] >= 45))
        )
        accent_ratio = float(np.mean(blue_or_green))

        # Detect repeated horizontal rules typical of bill tables.
        edges = cv2.Canny(gray, 50, 150)
        kernel_width = max(20, width // 8)
        horizontal_kernel = cv2.getStructuringElement(
            cv2.MORPH_RECT, (kernel_width, 1)
        )
        horizontal_rules = cv2.morphologyEx(
            edges, cv2.MORPH_OPEN, horizontal_kernel
        )
        rule_ratio = float(np.count_nonzero(horizontal_rules)) / float(height * width)

        if accent_ratio >= 0.015 and rule_ratio >= 0.00015:
            return DocumentClassificationResult(
                document_type="utility_bill",
                confidence="medium",
                notes=(
                    f"A4-ish structured page with blue/green header accent "
                    f"(accent={accent_ratio:.3f}, rules={rule_ratio:.5f})."
                ),
            )
        return None

    def _detect_invoice(
        self, img: np.ndarray, aspect_ratio: float, file_size_kb: float
    ):
        """
        Formal invoices tend to be:
          - A4 portrait (aspect ~1.41)
          - Mostly white with structured header/footer
          - Contain "INVOICE" keyword prominently

        TODO: OCR keyword check for "Invoice", "Invoice No", "Bill To",
              "Tax Invoice", "STRN" (Sales Tax Registration Number).
        TODO: Detect invoice header block (company logo area in top-left/right).

        MVP: No reliable heuristic without OCR — returns None (no match).
        """
        return None  # placeholder — defers to receipt default

    # ── Internal helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _decode_image(image_bytes: bytes) -> np.ndarray:
        """Decode raw image bytes into an OpenCV BGR ndarray."""
        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("cv2.imdecode returned None — bytes may not be a valid image.")
        return img
