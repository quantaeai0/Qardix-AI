from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from uuid import UUID
from typing import List

from app.database.connection import get_db
from app.models.models import Report, PatientAssessment, User, AppRole
from app.schemas.report import ReportResponse, ReportDetailResponse
from app.auth.dependencies import get_current_user
from app.services.storage import storage_service

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("", response_model=List[ReportResponse])
async def list_reports(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == AppRole.marketing_manager:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Marketing Managers are restricted from viewing report details per privacy policy.",
        )

    stmt = select(Report)
    if current_user.role == AppRole.doctor:
        stmt = stmt.where(Report.doctor_id == current_user.id)

    stmt = stmt.order_by(Report.generated_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{assessment_id}", response_model=ReportDetailResponse)
async def get_report_detail(
    assessment_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == AppRole.marketing_manager:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Marketing Managers are restricted from viewing report details per privacy policy.",
        )

    stmt = (
        select(PatientAssessment)
        .options(
            selectinload(PatientAssessment.doctor),
            selectinload(PatientAssessment.company),
            selectinload(PatientAssessment.ecg_record),
            selectinload(PatientAssessment.ai_result),
            selectinload(PatientAssessment.validation),
            selectinload(PatientAssessment.report),
        )
        .where(PatientAssessment.id == assessment_id)
    )
    res = await db.execute(stmt)
    assessment = res.scalar_one_or_none()

    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    if current_user.role == AppRole.doctor and assessment.doctor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    report = assessment.report
    report_id = report.id if report else assessment.id
    report_code = report.report_code if report else f"REP-{assessment.anonymous_patient_id}"
    generated_at = report.generated_at if report else assessment.created_at

    image_url = None
    if assessment.ecg_record and assessment.ecg_record.image_path:
        image_url = storage_service.get_public_url(assessment.ecg_record.image_path)

    ai = assessment.ai_result
    ai_summary = ai.ai_summary if ai else "No AI analysis available"
    findings = ai.findings if ai else []
    urgency = ai.urgency if ai else "routine"
    patient_explanation = ai.patient_explanation if ai else ""
    warning_signs = ai.warning_signs if ai else []

    val = assessment.validation
    validation_status = val.status if val else None
    doctor_notes = val.notes if val else None

    return ReportDetailResponse(
        id=report_id,
        report_code=report_code,
        generated_at=generated_at,
        doctor_name=assessment.doctor.display_name if assessment.doctor else "Doctor",
        doctor_specialty=assessment.doctor.specialty if assessment.doctor else None,
        company_name=assessment.company.name if assessment.company else None,
        anonymous_patient_id=assessment.anonymous_patient_id,
        clinical_data={
            "age": assessment.age,
            "sex": assessment.sex,
            "height_cm": float(assessment.height_cm),
            "weight_kg": float(assessment.weight_kg),
            "bmi": float(assessment.bmi) if assessment.bmi else None,
            "bp_systolic": assessment.bp_systolic,
            "bp_diastolic": assessment.bp_diastolic,
            "heart_rate": assessment.heart_rate,
            "spo2": assessment.spo2,
            "diabetes_status": assessment.diabetes_status,
            "diabetic_complications": assessment.diabetic_complications or [],
            "symptoms": assessment.symptoms or {},
            "medicines": assessment.medicines or [],
        },
        ai_summary=ai_summary,
        findings=findings,
        urgency=urgency,
        patient_explanation=patient_explanation,
        warning_signs=warning_signs,
        validation_status=validation_status,
        doctor_notes=doctor_notes,
        image_url=image_url,
    )
