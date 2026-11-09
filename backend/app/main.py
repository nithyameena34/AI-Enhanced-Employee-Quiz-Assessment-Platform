from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from backend.app.config import settings
from backend.app.database import Base, engine
from backend.app import models  # noqa: F401 - register SQLAlchemy models
from backend.app.routers import auth, admin, quizzes, assessments, ml, feedback

FRONTEND = Path(__file__).resolve().parents[2] / "frontend"

# Create missing tables for a fresh local database. Existing tables are not altered;
# use explicit migrations when changing an existing schema.
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description=(
        "Employee assessment platform with quiz management, secure assessment "
        "attempts, results, optional ML estimates and AI learning feedback."
    ),
)

# Supports the optional VS Code Live Server origin during local development.
# The recommended setup is to serve the frontend from this same FastAPI app.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://127.0.0.1:5501",
        "http://localhost:5501",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(quizzes.router)
app.include_router(assessments.router)
app.include_router(ml.router)
app.include_router(feedback.router)

@app.get("/api/health", tags=["Health"])
def health():
    return {"status": "healthy", "database": "connected"}

@app.get("/", include_in_schema=False)
def home():
    return RedirectResponse(url="/static/index.html")

app.mount("/static", StaticFiles(directory=str(FRONTEND)), name="static")
