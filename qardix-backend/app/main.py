from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.database.connection import engine, Base
from app.api.v1.router import api_v1_router
from app.database.seed import seed_database


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Create tables if they don't exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Shutdown: Clean up connections
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
