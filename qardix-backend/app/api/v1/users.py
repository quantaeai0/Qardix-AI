from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List, Optional
from uuid import UUID

from app.database.connection import get_db
from app.models.models import User, Company, AccountStatus, AppRole, PatientAssessment
from app.schemas.user import UserCreate, DoctorCreate, MMCreate, UserUpdate, UserStatusToggle, UserResponse
from app.auth.passwords import get_password_hash
from app.auth.dependencies import require_super_admin, get_current_user

router = APIRouter(prefix="/users", tags=["User Management"])


@router.post("/doctors", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_doctor(
    payload: DoctorCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    # Verify company exists
    comp_stmt = select(Company).where(Company.id == payload.company_id)
    comp = (await db.execute(comp_stmt)).scalar_one_or_none()
    if not comp:
        raise HTTPException(status_code=404, detail="Pharma Company not found")

    # Check duplicate email
    email_clean = payload.email.strip().lower()
    user_stmt = select(User).where(User.email == email_clean)
    if (await db.execute(user_stmt)).scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User with this email already exists")

    doc = User(
        email=email_clean,
        hashed_password=get_password_hash(payload.password),
        display_name=payload.display_name.strip(),
        role=AppRole.doctor,
        company_id=payload.company_id,
        specialty=payload.specialty,
        status=payload.status,
        force_password_reset=True,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    return UserResponse(
        id=doc.id,
        email=doc.email,
        display_name=doc.display_name,
        role=doc.role,
        company_id=doc.company_id,
        company_name=comp.name,
        specialty=doc.specialty,
        status=doc.status,
        force_password_reset=doc.force_password_reset,
        last_activity_at=doc.last_activity_at,
        created_at=doc.created_at,
        total_analyses=0,
    )


@router.post("/mms", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_marketing_manager(
    payload: MMCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    comp_stmt = select(Company).where(Company.id == payload.company_id)
    comp = (await db.execute(comp_stmt)).scalar_one_or_none()
    if not comp:
        raise HTTPException(status_code=404, detail="Pharma Company not found")

    email_clean = payload.email.strip().lower()
    user_stmt = select(User).where(User.email == email_clean)
    if (await db.execute(user_stmt)).scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User with this email already exists")

    mm = User(
        email=email_clean,
        hashed_password=get_password_hash(payload.password),
        display_name=payload.display_name.strip(),
        role=AppRole.marketing_manager,
        company_id=payload.company_id,
        status=payload.status,
        force_password_reset=True,
    )
    db.add(mm)
    await db.commit()
    await db.refresh(mm)

    return UserResponse(
        id=mm.id,
        email=mm.email,
        display_name=mm.display_name,
        role=mm.role,
        company_id=mm.company_id,
        company_name=comp.name,
        specialty=None,
        status=mm.status,
        force_password_reset=mm.force_password_reset,
        last_activity_at=mm.last_activity_at,
        created_at=mm.created_at,
        total_analyses=0,
    )


@router.get("", response_model=List[UserResponse])
async def list_users(
    role: Optional[AppRole] = Query(None),
    company_id: Optional[UUID] = Query(None),
    status_filter: Optional[AccountStatus] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User).options(selectinload(User.company))

    # Guardrails based on user role (PRD strict visibility rules)
    if current_user.role == AppRole.marketing_manager:
        # MM can ONLY see doctors belonging to their own company
        stmt = stmt.where(User.company_id == current_user.company_id, User.role == AppRole.doctor)
    elif current_user.role == AppRole.doctor:
        # Doctor can only see self
        stmt = stmt.where(User.id == current_user.id)
    else:
        # Super Admin filters
        if company_id:
            stmt = stmt.where(User.company_id == company_id)
        if role:
            stmt = stmt.where(User.role == role)

    if status_filter:
        stmt = stmt.where(User.status == status_filter)

    if search:
        stmt = stmt.where(User.display_name.ilike(f"%{search}%") | User.email.ilike(f"%{search}%"))

    result = await db.execute(stmt)
    users = result.scalars().all()

    response_list = []
    for u in users:
        analyses_stmt = select(func.count(PatientAssessment.id)).where(PatientAssessment.doctor_id == u.id)
        analyses_count = (await db.execute(analyses_stmt)).scalar() or 0

        response_list.append(
            UserResponse(
                id=u.id,
                email=u.email,
                display_name=u.display_name,
                role=u.role,
                company_id=u.company_id,
                company_name=u.company.name if u.company else None,
                specialty=u.specialty,
                status=u.status,
                force_password_reset=u.force_password_reset,
                last_activity_at=u.last_activity_at,
                created_at=u.created_at,
                total_analyses=analyses_count,
            )
        )

    return response_list


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User).options(selectinload(User.company)).where(User.id == user_id)
    u = (await db.execute(stmt)).scalar_one_or_none()

    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    if current_user.role == AppRole.marketing_manager and u.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Access denied")

    analyses_stmt = select(func.count(PatientAssessment.id)).where(PatientAssessment.doctor_id == u.id)
    analyses_count = (await db.execute(analyses_stmt)).scalar() or 0

    return UserResponse(
        id=u.id,
        email=u.email,
        display_name=u.display_name,
        role=u.role,
        company_id=u.company_id,
        company_name=u.company.name if u.company else None,
        specialty=u.specialty,
        status=u.status,
        force_password_reset=u.force_password_reset,
        last_activity_at=u.last_activity_at,
        created_at=u.created_at,
        total_analyses=analyses_count,
    )


@router.patch("/{user_id}/status", response_model=UserResponse)
async def toggle_user_status(
    user_id: UUID,
    payload: UserStatusToggle,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User).options(selectinload(User.company)).where(User.id == user_id)
    u = (await db.execute(stmt)).scalar_one_or_none()

    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    u.status = payload.status
    await db.commit()
    await db.refresh(u)

    return await get_user(user_id=u.id, current_user=admin, db=db)
