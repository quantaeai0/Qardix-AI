from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from uuid import UUID

from app.database.connection import get_db
from app.models.models import Company, User, AccountStatus, AppRole, PatientAssessment
from app.schemas.company import CompanyCreate, CompanyUpdate, CompanyStatusToggle, CompanyResponse
from app.auth.dependencies import require_super_admin, get_current_user

router = APIRouter(prefix="/companies", tags=["Company Management"])


@router.post("", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
async def create_company(
    payload: CompanyCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    # Check duplicate code
    stmt = select(Company).where(Company.code == payload.code.strip())
    existing = await db.execute(stmt)
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Company code already exists")

    company = Company(
        name=payload.name.strip(),
        code=payload.code.strip(),
        primary_contact=payload.primary_contact,
        contact_email=payload.contact_email,
        contact_phone=payload.contact_phone,
        notes=payload.notes,
        status=payload.status,
    )
    db.add(company)
    await db.commit()
    await db.refresh(company)

    return CompanyResponse(
        id=company.id,
        name=company.name,
        code=company.code,
        primary_contact=company.primary_contact,
        contact_email=company.contact_email,
        contact_phone=company.contact_phone,
        notes=company.notes,
        status=company.status,
        created_at=company.created_at,
        doctor_count=0,
        mm_count=0,
        total_analyses=0,
    )


@router.get("", response_model=List[CompanyResponse])
async def list_companies(
    status_filter: Optional[AccountStatus] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    stmt = select(Company)
    if status_filter:
        stmt = stmt.where(Company.status == status_filter)
    if search:
        stmt = stmt.where(Company.name.ilike(f"%{search}%") | Company.code.ilike(f"%{search}%"))

    result = await db.execute(stmt)
    companies = result.scalars().all()

    response_list = []
    for comp in companies:
        # Get doctor count
        doc_stmt = select(func.count(User.id)).where(User.company_id == comp.id, User.role == AppRole.doctor)
        doc_count = (await db.execute(doc_stmt)).scalar() or 0

        # Get MM count
        mm_stmt = select(func.count(User.id)).where(User.company_id == comp.id, User.role == AppRole.marketing_manager)
        mm_count = (await db.execute(mm_stmt)).scalar() or 0

        # Get total analyses count
        analyses_stmt = select(func.count(PatientAssessment.id)).where(PatientAssessment.company_id == comp.id)
        analyses_count = (await db.execute(analyses_stmt)).scalar() or 0

        response_list.append(
            CompanyResponse(
                id=comp.id,
                name=comp.name,
                code=comp.code,
                primary_contact=comp.primary_contact,
                contact_email=comp.contact_email,
                contact_phone=comp.contact_phone,
                notes=comp.notes,
                status=comp.status,
                created_at=comp.created_at,
                doctor_count=doc_count,
                mm_count=mm_count,
                total_analyses=analyses_count,
            )
        )

    return response_list


@router.get("/{company_id}", response_model=CompanyResponse)
async def get_company(
    company_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    stmt = select(Company).where(Company.id == company_id)
    result = await db.execute(stmt)
    comp = result.scalar_one_or_none()

    if not comp:
        raise HTTPException(status_code=404, detail="Company not found")

    doc_stmt = select(func.count(User.id)).where(User.company_id == comp.id, User.role == AppRole.doctor)
    doc_count = (await db.execute(doc_stmt)).scalar() or 0

    mm_stmt = select(func.count(User.id)).where(User.company_id == comp.id, User.role == AppRole.marketing_manager)
    mm_count = (await db.execute(mm_stmt)).scalar() or 0

    analyses_stmt = select(func.count(PatientAssessment.id)).where(PatientAssessment.company_id == comp.id)
    analyses_count = (await db.execute(analyses_stmt)).scalar() or 0

    return CompanyResponse(
        id=comp.id,
        name=comp.name,
        code=comp.code,
        primary_contact=comp.primary_contact,
        contact_email=comp.contact_email,
        contact_phone=comp.contact_phone,
        notes=comp.notes,
        status=comp.status,
        created_at=comp.created_at,
        doctor_count=doc_count,
        mm_count=mm_count,
        total_analyses=analyses_count,
    )


@router.put("/{company_id}", response_model=CompanyResponse)
async def update_company(
    company_id: UUID,
    payload: CompanyUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    stmt = select(Company).where(Company.id == company_id)
    result = await db.execute(stmt)
    comp = result.scalar_one_or_none()

    if not comp:
        raise HTTPException(status_code=404, detail="Company not found")

    if payload.name is not None:
        comp.name = payload.name.strip()
    if payload.primary_contact is not None:
        comp.primary_contact = payload.primary_contact
    if payload.contact_email is not None:
        comp.contact_email = payload.contact_email
    if payload.contact_phone is not None:
        comp.contact_phone = payload.contact_phone
    if payload.notes is not None:
        comp.notes = payload.notes
    if payload.status is not None:
        comp.status = payload.status

    await db.commit()
    await db.refresh(comp)

    return await get_company(company_id=comp.id, db=db, admin=admin)


@router.patch("/{company_id}/status", response_model=CompanyResponse)
async def toggle_company_status(
    company_id: UUID,
    payload: CompanyStatusToggle,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    stmt = select(Company).where(Company.id == company_id)
    result = await db.execute(stmt)
    comp = result.scalar_one_or_none()

    if not comp:
        raise HTTPException(status_code=404, detail="Company not found")

    comp.status = payload.status
    await db.commit()
    await db.refresh(comp)

    return await get_company(company_id=comp.id, db=db, admin=admin)


@router.get("/{company_id}/doctors")
async def list_company_doctors(
    company_id: UUID,
    status_filter: Optional[AccountStatus] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    """
    List all doctors belonging to a specific pharma company.
    Used on the Company Detail page (Super Admin dashboard).
    Includes total ECG analyses count per doctor.
    """
    # Verify company exists
    comp = (await db.execute(select(Company).where(Company.id == company_id))).scalar_one_or_none()
    if not comp:
        raise HTTPException(status_code=404, detail="Company not found")

    stmt = select(User).where(
        User.company_id == company_id,
        User.role == AppRole.doctor,
    )
    if status_filter:
        stmt = stmt.where(User.status == status_filter)
    if search:
        stmt = stmt.where(
            User.display_name.ilike(f"%{search}%") | User.email.ilike(f"%{search}%")
        )
    stmt = stmt.order_by(User.display_name)

    doctors = (await db.execute(stmt)).scalars().all()

    response_list = []
    for doc in doctors:
        analyses_count = (
            await db.execute(
                select(func.count(PatientAssessment.id)).where(PatientAssessment.doctor_id == doc.id)
            )
        ).scalar() or 0

        response_list.append({
            "id":                   str(doc.id),
            "email":                doc.email,
            "display_name":         doc.display_name,
            "role":                 doc.role,
            "company_id":           str(doc.company_id),
            "company_name":         comp.name,
            "specialty":            doc.specialty,
            "status":               doc.status,
            "force_password_reset": doc.force_password_reset,
            "last_activity_at":     doc.last_activity_at,
            "created_at":           doc.created_at,
            "total_analyses":       analyses_count,
        })

    return response_list


@router.get("/{company_id}/mms")
async def list_company_mms(
    company_id: UUID,
    status_filter: Optional[AccountStatus] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    """
    List all Marketing Managers belonging to a specific pharma company.
    Used on the Company Detail page (Super Admin dashboard).
    """
    comp = (await db.execute(select(Company).where(Company.id == company_id))).scalar_one_or_none()
    if not comp:
        raise HTTPException(status_code=404, detail="Company not found")

    stmt = select(User).where(
        User.company_id == company_id,
        User.role == AppRole.marketing_manager,
    )
    if status_filter:
        stmt = stmt.where(User.status == status_filter)
    stmt = stmt.order_by(User.display_name)

    mms = (await db.execute(stmt)).scalars().all()

    return [
        {
            "id":                   str(mm.id),
            "email":                mm.email,
            "display_name":         mm.display_name,
            "role":                 mm.role,
            "company_id":           str(mm.company_id),
            "company_name":         comp.name,
            "specialty":            None,
            "status":               mm.status,
            "force_password_reset": mm.force_password_reset,
            "last_activity_at":     mm.last_activity_at,
            "created_at":           mm.created_at,
            "total_analyses":       0,
        }
        for mm in mms
    ]

