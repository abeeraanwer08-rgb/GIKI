"""Deterministic date parsing for bank statements.

Statements print dates in many shapes (``05/09/2026``, ``05-Sep-26``, ``05 Sep``)
and often leave the year off. The vision model is asked to copy what is printed;
this module turns that text into an ISO date using the statement period to pick
the year, instead of leaving the date blank or letting the model guess.
"""

from __future__ import annotations

import re
from datetime import date

_MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9, "oct": 10,
    "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}

_NUMERIC = re.compile(r"^(\d{1,2})[./\-\s](\d{1,2})(?:[./\-\s](\d{2}|\d{4}))?$")
_DAY_MONTH_NAME = re.compile(r"^(\d{1,2})(?:st|nd|rd|th)?[\s./\-]+([A-Za-z]{3,9})\.?,?(?:[\s./\-]+(\d{2}|\d{4}))?$")
_MONTH_NAME_DAY = re.compile(r"^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?(?:\s+(\d{2}|\d{4}))?$")


def to_iso(value: object) -> str | None:
    """Accept only a real YYYY-MM-DD date."""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10]).isoformat()
    except ValueError:
        return None


def _make(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _year(raw: str) -> int:
    value = int(raw)
    return 2000 + value if value < 100 else value


def _candidate_years(period_start: str | None, period_end: str | None) -> list[int]:
    years = {int(p[:4]) for p in (period_start, period_end) if p and len(p) >= 4 and p[:4].isdigit()}
    if len(years) == 2:  # e.g. Dec 2025 – Jan 2026
        low, high = min(years), max(years)
        return list(range(low, high + 1))
    return sorted(years)


def parse_statement_date(
    text: object,
    *,
    period_start: str | None = None,
    period_end: str | None = None,
) -> str | None:
    """Best-effort ISO date from printed text; ``None`` when it cannot be done honestly.

    Day-first is assumed for numeric dates (the Pakistani convention), unless
    only the month-first reading falls inside the statement period.
    """
    iso = to_iso(text)
    if iso:
        return iso
    if text is None:
        return None
    raw = str(text).strip().strip(",")
    if not raw:
        return None

    parts: list[tuple[int, int, str | None]] = []  # (month, day, year-text)
    match = _NUMERIC.match(raw)
    if match:
        first, second, year = int(match.group(1)), int(match.group(2)), match.group(3)
        parts.append((second, first, year))  # day-first
        if first != second:
            parts.append((first, second, year))  # month-first
    else:
        match = _DAY_MONTH_NAME.match(raw)
        if match:
            month = _MONTHS.get(match.group(2).lower())
            if month:
                parts.append((month, int(match.group(1)), match.group(3)))
        else:
            match = _MONTH_NAME_DAY.match(raw)
            if match:
                month = _MONTHS.get(match.group(1).lower())
                if month:
                    parts.append((month, int(match.group(2)), match.group(3)))

    low = period_start or "0000-01-01"
    high = period_end or "9999-12-31"
    years_from_period = _candidate_years(period_start, period_end)

    valid: list[date] = []
    for month, day, year_text in parts:
        years = [_year(year_text)] if year_text else years_from_period
        for year in years:
            candidate = _make(year, month, day)
            if candidate:
                valid.append(candidate)
    if not valid:
        return None

    in_period = [d for d in valid if low <= d.isoformat() <= high]
    if period_start or period_end:
        if in_period:
            return in_period[0].isoformat()  # day-first candidates come first
        # Printed outside the period (e.g. a carried-forward row): keep it only when
        # the year was printed, since an inferred year would be a guess.
        explicit = [d for (m, dd, y) in parts if y for d in [_make(_year(y), m, dd)] if d]
        return explicit[0].isoformat() if explicit else None
    return valid[0].isoformat() if parts and parts[0][2] else None
