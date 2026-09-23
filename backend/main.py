from fastapi import FastAPI

from routes.debug import router as debug_router
from routes.financial_records import router as financial_records_router
from routes.insights import router as insights_router
from routes.receipt import router as receipt_router

app = FastAPI(
    title="KharchAI API",
    description="AI-powered financial copilot for Pakistan — backend API.",
    version="0.1.0",
)

app.include_router(receipt_router)
app.include_router(financial_records_router)
app.include_router(insights_router)
app.include_router(debug_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
