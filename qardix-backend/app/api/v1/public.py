from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database.connection import get_db
from app.models.models import DemoRequest
from app.schemas.public import DemoRequestCreate, DemoRequestResponse

router = APIRouter(prefix="/public", tags=["Public Routes"])


@router.post("/request-demo", response_model=DemoRequestResponse, status_code=status.HTTP_201_CREATED)
async def request_demo(payload: DemoRequestCreate, db: AsyncSession = Depends(get_db)):
    req = DemoRequest(
        name=payload.name.strip(),
        email=payload.email.strip().lower(),
        organisation=payload.organisation.strip() if payload.organisation else None,
        message=payload.message.strip() if payload.message else None,
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)

    return DemoRequestResponse(
        id=req.id,
        name=req.name,
        email=req.email,
        organisation=req.organisation,
        message=req.message,
        created_at=req.created_at,
    )


@router.get("/demo-requests", response_model=list[DemoRequestResponse])
async def list_demo_requests(db: AsyncSession = Depends(get_db)):
    stmt = select(DemoRequest).order_by(DemoRequest.created_at.desc())
    res = await db.execute(stmt)
    return res.scalars().all()

