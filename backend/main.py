from fastapi import FastAPI

from routes.budgets import router as budgets_router
from routes.debug import router as debug_router
from routes.financial_records import router as financial_records_router
from routes.insights import router as insights_router
from routes.receipt import router as receipt_router

app = FastAPI(
    title="HissabAI API",
    description="HissabAI — AI-powered financial copilot for Pakistan (built on KharchAI).",
    version="0.1.0",
)

app.include_router(receipt_router)
app.include_router(financial_records_router)
app.include_router(insights_router)
app.include_router(budgets_router)
app.include_router(debug_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
