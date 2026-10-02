"""Turn an uploaded PDF into page images for the vision pipeline.

PDFs are rendered with PyMuPDF (no external poppler install). Only rendering
happens here; reading the pages is the parsers' job, exactly as for photos.
"""

from __future__ import annotations

import pymupdf

MAX_PAGES = 12
# 170 dpi puts an A4 page at roughly 1400x1980 px: sharp enough for small statement
# text without producing huge images to send to the model.
RENDER_DPI = 170
MAX_SIDE_PX = 3000


class PdfError(ValueError):
    """The PDF cannot be used; the message is safe to show the user."""


def is_pdf(data: bytes) -> bool:
    return data[:5] == b"%PDF-"


def render_pdf_pages(data: bytes, *, max_pages: int = MAX_PAGES) -> list[bytes]:
    """Render every page of a PDF to PNG bytes, in order."""
    try:
        document = pymupdf.open(stream=data, filetype="pdf")
    except Exception as exc:  # noqa: BLE001 — any parser failure means "not a usable PDF"
        raise PdfError("That PDF could not be opened. It may be damaged.") from exc

    try:
        if document.needs_pass:
            raise PdfError("That PDF is password-protected. Remove the password and try again.")
        count = document.page_count
        if count == 0:
            raise PdfError("That PDF has no pages.")
        if count > max_pages:
            raise PdfError(f"That PDF has {count} pages; the limit is {max_pages}. Split it and upload in parts.")

        pages: list[bytes] = []
        for page in document:
            width_in, height_in = page.rect.width / 72, page.rect.height / 72
            dpi = min(RENDER_DPI, MAX_SIDE_PX / max(width_in, height_in, 1e-6))
            try:
                pages.append(page.get_pixmap(dpi=dpi, alpha=False).tobytes("png"))
            except Exception as exc:  # noqa: BLE001
                raise PdfError(f"Page {page.number + 1} of the PDF could not be read.") from exc
        return pages
    finally:
        document.close()
