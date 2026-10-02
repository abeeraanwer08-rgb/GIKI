import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.auth import router as auth_router
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

# The mobile app is not a browser and ignores CORS; the website is, so it must be
# allowed explicitly. Comma-separated origins, e.g.
#   CORS_ALLOW_ORIGINS=https://hissabai.example.com
# The defaults cover the web dev server (5173) and `vite preview` (4173).
_DEFAULT_CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"
_cors_origins = [
    origin.strip().rstrip("/")
    for origin in os.environ.get("CORS_ALLOW_ORIGINS", _DEFAULT_CORS_ORIGINS).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    allow_credentials=False,  # auth uses a Bearer token, never cookies
    max_age=600,
)

app.include_router(auth_router)
app.include_router(receipt_router)
app.include_router(financial_records_router)
app.include_router(insights_router)
app.include_router(budgets_router)
app.include_router(debug_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
