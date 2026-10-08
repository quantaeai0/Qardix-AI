from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional
from uuid import UUID

from app.database.connection import get_db
from app.models.models import User, Company, PatientAssessment, AccountStatus, AppRole, UsageEvent
from app.auth.dependencies import require_marketing_manager, get_current_user

router = APIRouter(prefix="/analytics", tags=["Usage Analytics"])


@router.get("/dashboard")
async def get_dashboard_kpis(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == AppRole.super_admin:
        # Super admin global KPIs
        total_companies = (await db.execute(select(func.count(Company.id)))).scalar() or 0
        active_companies = (await db.execute(select(func.count(Company.id)).where(Company.status == AccountStatus.active))).scalar() or 0
        
        total_mms = (await db.execute(select(func.count(User.id)).where(User.role == AppRole.marketing_manager))).scalar() or 0
        total_doctors = (await db.execute(select(func.count(User.id)).where(User.role == AppRole.doctor))).scalar() or 0
        active_doctors = (await db.execute(select(func.count(User.id)).where(User.role == AppRole.doctor, User.status == AccountStatus.active))).scalar() or 0
        
        total_analyses = (await db.execute(select(func.count(PatientAssessment.id)))).scalar() or 0

        return {
            "total_companies": total_companies,
            "active_companies": active_companies,
            "inactive_companies": total_companies - active_companies,
            "total_mms": total_mms,
            "total_doctors": total_doctors,
            "active_doctors": active_doctors,
            "inactive_doctors": total_doctors - active_doctors,
            "total_analyses": total_analyses,
        }

    elif current_user.role == AppRole.marketing_manager:
        if not current_user.company_id:
            raise HTTPException(status_code=400, detail="MM is not associated with any company")

        comp_id = current_user.company_id
        comp = (await db.execute(select(Company).where(Company.id == comp_id))).scalar_one_or_none()

        total_doctors = (await db.execute(select(func.count(User.id)).where(User.company_id == comp_id, User.role == AppRole.doctor))).scalar() or 0
        active_doctors = (await db.execute(select(func.count(User.id)).where(User.company_id == comp_id, User.role == AppRole.doctor, User.status == AccountStatus.active))).scalar() or 0
        total_analyses = (await db.execute(select(func.count(PatientAssessment.id)).where(PatientAssessment.company_id == comp_id))).scalar() or 0

        return {
            "company_name": comp.name if comp else None,
            "total_doctors": total_doctors,
            "active_doctors": active_doctors,
            "inactive_doctors": total_doctors - active_doctors,
            "total_ecgs_analysed": total_analyses,
        }

    elif current_user.role == AppRole.doctor:
        total_analyses = (await db.execute(select(func.count(PatientAssessment.id)).where(PatientAssessment.doctor_id == current_user.id))).scalar() or 0
        return {
            "total_ecgs_analysed": total_analyses,
            "doctor_name": current_user.display_name,
        }


@router.get("/doctors")
async def get_doctor_usage_analytics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_marketing_manager),
):
    stmt = select(User).where(User.role == AppRole.doctor)

    if current_user.role == AppRole.marketing_manager:
        stmt = stmt.where(User.company_id == current_user.company_id)

    result = await db.execute(stmt)
    doctors = result.scalars().all()

    usage_list = []
    for doc in doctors:
        count_stmt = select(func.count(PatientAssessment.id)).where(PatientAssessment.doctor_id == doc.id)
        total_ecgs = (await db.execute(count_stmt)).scalar() or 0

        usage_list.append({
            "doctor_id": str(doc.id),
            "doctor_name": doc.display_name,
            "email": doc.email,
            "specialty": doc.specialty,
            "status": doc.status,
            "last_activity_at": doc.last_activity_at,
            "total_ecgs_analysed": total_ecgs
        })

    return usage_list


@router.get("/events")
async def get_usage_events(
    company_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(UsageEvent).order_by(UsageEvent.created_at.desc())

    if current_user.role == AppRole.marketing_manager:
        if not current_user.company_id:
            return []
        stmt = stmt.where(UsageEvent.company_id == current_user.company_id)
    elif current_user.role == AppRole.doctor:
        stmt = stmt.where(UsageEvent.doctor_id == current_user.id)
    elif current_user.role == AppRole.super_admin:
        if company_id:
            stmt = stmt.where(UsageEvent.company_id == company_id)

    res = await db.execute(stmt)
    events = res.scalars().all()
    return [
        {
            "id": str(e.id),
            "company_id": str(e.company_id) if e.company_id else None,
            "doctor_id": str(e.doctor_id),
            "event_type": e.event_type,
            "analysis_status": e.analysis_status,
            "created_at": e.created_at.isoformat() if e.created_at else "",
        }
        for e in events
    ]

