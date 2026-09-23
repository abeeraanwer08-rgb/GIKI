"""Schemas for the AI financial insights and Q&A endpoints."""

from pydantic import BaseModel, Field

from services.financial_calculations import FinancialSummary


class InsightsResponse(BaseModel):
    """Deterministic summary plus AI-generated narrative insights."""

    summary: FinancialSummary
    headline: str
    insights: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)


class AskRequest(BaseModel):
    question: str


class AskResponse(BaseModel):
    question: str
    answer: str
