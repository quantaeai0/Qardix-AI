import logging
import sys
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from uvicorn.logging import DefaultFormatter

from app.config import settings
from app.database.connection import engine
from app.api.v1.router import api_v1_router

# ── Terminal Logging Configuration ────────────────────────────────────────────
# Explicitly attach a StreamHandler to the 'app' hierarchy with Uvicorn's formatter
app_logger = logging.getLogger("app")
app_logger.setLevel(logging.INFO)
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(DefaultFormatter("%(levelprefix)s [%(name)s] %(message)s"))
app_logger.handlers = [console_handler]
app_logger.propagate = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Tables are managed by Alembic migrations (run: alembic upgrade head).
    app_logger.info("Qardix AI Backend initialized — terminal logging is ACTIVE.")
    yield
    # Shutdown: release connection pool
    await engine.dispose()


app = FastAPI(
    title="Qardix AI - Backend API",
    description="Doctor-facing ECG AI Intelligence & Platform Backend API",
    version="1.0.0",
    lifespan=lifespan,
)

# Request logging middleware — guarantees every endpoint hit shows in terminal
@app.middleware("http")
async def log_requests_middleware(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    app_logger.info(f"{request.method} {request.url.path} -> {response.status_code} ({duration_ms:.1f}ms)")
    return response


# CORS Middleware configuration
app.add_middleware(
    CORSMiddleware,
    # allow_origins=settings.origins_list,
    allow_origins=["*"],
    allow_origin_regex=".*",
    # allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:[0-9]+)?",
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
