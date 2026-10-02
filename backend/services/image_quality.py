"""
Image Quality Service — MVP implementation using OpenCV.

Runs BEFORE OpenAI receipt analysis to gate out images that will
produce poor or unreliable extraction results.

Future checks to add here:
  - Glare detection (bright-pixel proportion threshold)
  - Receipt presence detection (aspect ratio + white-region heuristics)
  - Perspective / skew correction hint
  - Multi-page / stitching recommendation for very long receipts
"""

import logging

import cv2
import numpy as np

from schemas.receipt import ImageQualityReport

logger = logging.getLogger(__name__)

# ── Tunable thresholds ────────────────────────────────────────────────────────
BLUR_FAIL_THRESHOLD = 50.0        # Laplacian variance below this → FAIL
BLUR_WARN_THRESHOLD = 100.0       # below this (but above FAIL) → WARNING
BRIGHTNESS_TOO_DARK = 50          # mean pixel below this → too dark (FAIL)
BRIGHTNESS_DARK_WARN = 70         # below this (but above TOO_DARK) → WARNING
BRIGHTNESS_TOO_BRIGHT = 220       # above this → overexposed (FAIL)
BRIGHTNESS_BRIGHT_WARN = 200      # above this (but below TOO_BRIGHT) → WARNING
# A statement is a mostly white A4 page of small text, so a perfectly good scan
# averages well above a receipt's brightness. Only a blown-out page should fail.
PAGE_BRIGHTNESS_TOO_BRIGHT = 252
PAGE_BRIGHTNESS_BRIGHT_WARN = 248
PAGE_DOCUMENT_TYPES = {"bank_statement", "invoice"}
MIN_DIMENSION_PX = 1000           # minimum width AND height in pixels
LONG_RECEIPT_RATIO = 3.5          # height / width ratio above this → long receipt


def _decode(image_bytes: bytes):
    """Decode raw bytes to a BGR cv2 image array, or return None on failure."""
    nparr = np.frombuffer(image_bytes, np.uint8)
    return cv2.imdecode(nparr, cv2.IMREAD_COLOR)


class ImageQualityService:
    """
    Analyses receipt image quality using OpenCV.

    All logic is synchronous / CPU-bound.  The single public entry point is
    `validate_image(image_bytes) -> ImageQualityReport`.
    """

    # ── Public entry point ───────────────────────────────────────────────────

    def validate_image(
        self, image_bytes: bytes, document_type: str | None = None
    ) -> ImageQualityReport:
        """
        Run all quality checks and return a consolidated report.

        Returns a report with passed=False and a descriptive error list when
        the image cannot be decoded or fails a hard check.  Soft issues
        produce warnings but still allow analysis to proceed.

        Args:
            image_bytes: Raw image bytes (JPEG / PNG / WebP / BMP / TIFF).
            document_type: Type chosen by the user, if any. Full-page documents
                get a more lenient brightness ceiling than receipts.

        Returns:
            ImageQualityReport with passed, warnings, errors, is_long_receipt,
            quality_score (0–100).
        """
        warnings: list[str] = []
        errors: list[str] = []
        is_long_receipt = False
        score = 100

        img = _decode(image_bytes)
        if img is None:
            return ImageQualityReport(
                passed=False,
                warnings=[],
                errors=["Could not decode image. Please upload a valid JPEG, PNG, or WebP file."],
                is_long_receipt=False,
                quality_score=0,
            )

        h, w = img.shape[:2]
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # A. Blur detection ───────────────────────────────────────────────────
        blur_result, blur_score_penalty = self._check_blur(gray)
        if blur_result == "FAIL":
            lap_var = cv2.Laplacian(gray, cv2.CV_64F).var()
            errors.append(
                f"Image is too blurry (sharpness: {lap_var:.1f}). "
                "Please retake the photo with a steady hand."
            )
            score -= 40
        elif blur_result == "WARNING":
            lap_var = cv2.Laplacian(gray, cv2.CV_64F).var()
            warnings.append(
                f"Image is slightly blurry (sharpness: {lap_var:.1f}). "
                "A sharper photo may improve extraction accuracy."
            )
            score -= 15

        # B. Brightness ───────────────────────────────────────────────────────
        brightness_result, mean_brightness = self._check_brightness(gray, document_type)
        if brightness_result == "TOO_DARK_FAIL":
            errors.append(
                f"Image is too dark (brightness: {mean_brightness:.1f}/255). "
                "Please take the photo in better lighting."
            )
            score -= 30
        elif brightness_result == "TOO_DARK_WARN":
            warnings.append(
                f"Image is slightly dark (brightness: {mean_brightness:.1f}/255). "
                "Better lighting may improve accuracy."
            )
            score -= 10
        elif brightness_result == "TOO_BRIGHT_FAIL":
            errors.append(
                f"Image is overexposed (brightness: {mean_brightness:.1f}/255). "
                "Please avoid direct flash or bright backgrounds."
            )
            score -= 30
        elif brightness_result == "TOO_BRIGHT_WARN":
            warnings.append(
                f"Image is slightly bright (brightness: {mean_brightness:.1f}/255). "
                "Reducing glare may improve accuracy."
            )
            score -= 10

        # C. Resolution ───────────────────────────────────────────────────────
        if w < MIN_DIMENSION_PX or h < MIN_DIMENSION_PX:
            errors.append(
                f"Image resolution is too low ({w}×{h} px). "
                f"Please upload an image of at least {MIN_DIMENSION_PX}×{MIN_DIMENSION_PX} px."
            )
            score -= 40

        # D. Long receipt detection ───────────────────────────────────────────
        if w > 0:
            ratio = h / w
            if ratio > LONG_RECEIPT_RATIO:
                is_long_receipt = True
                warnings.append(
                    f"This receipt looks very long (aspect ratio {ratio:.1f}:1). "
                    "Capture it in 2–3 overlapping photos for better accuracy."
                )

        # TODO: Add glare detection here (bright-pixel proportion threshold).
        # TODO: Add receipt-presence detection (white-region / edge heuristic).
        # TODO: Add skew/perspective detection and correction hint.

        score = max(0, min(100, score))
        return ImageQualityReport(
            passed=len(errors) == 0,
            warnings=warnings,
            errors=errors,
            is_long_receipt=is_long_receipt,
            quality_score=score,
        )

    # ── Private check helpers ────────────────────────────────────────────────

    def _check_blur(self, gray: np.ndarray) -> tuple[str, float]:
        """Return (status, laplacian_variance).  Status: PASS | WARNING | FAIL."""
        lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        if lap_var < BLUR_FAIL_THRESHOLD:
            return "FAIL", lap_var
        if lap_var < BLUR_WARN_THRESHOLD:
            return "WARNING", lap_var
        return "PASS", lap_var

    def _check_brightness(
        self, gray: np.ndarray, document_type: str | None = None
    ) -> tuple[str, float]:
        """Return (status, mean_brightness).  Status: PASS | TOO_DARK_FAIL | etc."""
        mean = float(gray.mean())
        if mean < BRIGHTNESS_TOO_DARK:
            return "TOO_DARK_FAIL", mean
        if mean < BRIGHTNESS_DARK_WARN:
            return "TOO_DARK_WARN", mean
        page = document_type in PAGE_DOCUMENT_TYPES
        if mean > (PAGE_BRIGHTNESS_TOO_BRIGHT if page else BRIGHTNESS_TOO_BRIGHT):
            return "TOO_BRIGHT_FAIL", mean
        if mean > (PAGE_BRIGHTNESS_BRIGHT_WARN if page else BRIGHTNESS_BRIGHT_WARN):
            return "TOO_BRIGHT_WARN", mean
        return "PASS", mean
