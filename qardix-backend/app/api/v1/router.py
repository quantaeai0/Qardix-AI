from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.companies import router as companies_router
from app.api.v1.users import router as users_router
from app.api.v1.assessments import router as assessments_router
from app.api.v1.ecg import router as ecg_router
from app.api.v1.analytics import router as analytics_router
from app.api.v1.public import router as public_router

api_v1_router = APIRouter(prefix="/api/v1")

api_v1_router.include_router(auth_router)
api_v1_router.include_router(companies_router)
api_v1_router.include_router(users_router)
api_v1_router.include_router(assessments_router)
api_v1_router.include_router(ecg_router)
api_v1_router.include_router(analytics_router)
api_v1_router.include_router(public_router)
