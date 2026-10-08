from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.database.connection import engine
from app.api.v1.router import api_v1_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Tables are managed by Alembic migrations (run: alembic upgrade head).
    # create_all is intentionally removed — Alembic is the single source of truth.
    yield
    # Shutdown: release connection pool
    await engine.dispose()


app = FastAPI(
    title="Qardix AI - Backend API",
    description="Doctor-facing ECG AI Intelligence & Platform Backend API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS Middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:[0-9]+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Routers
app.include_router(api_v1_router)


@app.get("/")
async def root():
    return {
        "app": "Qardix AI API",
        "version": "1.0.0",
        "status": "online",
        "docs": "/docs",
    }


@app.get("/healthcheck")
async def healthcheck():
    return {"status": "healthy"}
