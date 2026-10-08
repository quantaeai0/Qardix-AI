from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, inspect
from sqlalchemy.orm import selectinload
from typing import List, Optional
from uuid import UUID
import random
import string
from datetime import datetime

from app.database.connection import get_db
from app.models.models import PatientAssessment, DoctorValidation, AiResult, User, AppRole, Report, UsageEvent
from app.schemas.assessment import (
    PatientAssessmentCreate,
    PatientAssessmentResponse,
    DoctorValidationCreate,
    DoctorValidationResponse,
)
from app.auth.dependencies import require_doctor, get_current_user

router = APIRouter(prefix="/assessments", tags=["Patient Assessments"])


def generate_anonymous_patient_id() -> str:
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"PAT-{datetime.now().year}-{suffix}"


@router.post("", response_model=PatientAssessmentResponse, status_code=status.HTTP_201_CREATED)
async def create_assessment(
    payload: PatientAssessmentCreate,
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_doctor),
):
    # Auto-calculate BMI: weight_kg / (height_m^2)
    height_m = payload.height_cm / 100.0
    bmi = round(payload.weight_kg / (height_m * height_m), 2) if height_m > 0 else None

    patient_id = generate_anonymous_patient_id()

    assessment = PatientAssessment(
        anonymous_patient_id=patient_id,
        doctor_id=doctor.id,
        company_id=doctor.company_id,
        age=payload.age,
        sex=payload.sex,
        height_cm=payload.height_cm,
        weight_kg=payload.weight_kg,
        bmi=bmi,
        bp_systolic=payload.bp_systolic,
        bp_diastolic=payload.bp_diastolic,
        heart_rate=payload.heart_rate,
        spo2=payload.spo2,
        diabetes_status=payload.diabetes_status,
        diabetic_complications=payload.diabetic_complications,
        symptoms=payload.symptoms.model_dump(),
        medicines=payload.medicines,
        training_consent=payload.training_consent,
    )

    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)

    return PatientAssessmentResponse(
        id=assessment.id,
        anonymous_patient_id=assessment.anonymous_patient_id,
        doctor_id=doctor.id,
        company_id=doctor.company_id,
        doctor_name=doctor.display_name,
        company_name=doctor.company.name if doctor.company else None,
        age=assessment.age,
        sex=assessment.sex,
        height_cm=float(assessment.height_cm),
        weight_kg=float(assessment.weight_kg),
        bmi=float(assessment.bmi) if assessment.bmi else None,
        bp_systolic=assessment.bp_systolic,
        bp_diastolic=assessment.bp_diastolic,
        heart_rate=assessment.heart_rate,
        spo2=assessment.spo2,
        diabetes_status=assessment.diabetes_status,
        diabetic_complications=assessment.diabetic_complications or [],
        symptoms=assessment.symptoms or {},
        medicines=assessment.medicines or [],
        training_consent=assessment.training_consent,
        created_at=assessment.created_at,
        ai_summary=None,
        urgency=None,
        quality_status=None,
        processing_status=None,
        validation_status=None,
        report_code=None,
        report_status=None,
    )


def serialize_assessment(a: PatientAssessment) -> PatientAssessmentResponse:
    unloaded = inspect(a).unloaded
    ai = a.ai_result if "ai_result" not in unloaded else None
    ecg = a.ecg_record if "ecg_record" not in unloaded else None
    val = a.validation if "validation" not in unloaded else None
    rep = a.report if "report" not in unloaded else None
    doc = a.doctor if "doctor" not in unloaded else None
    comp = a.company if "company" not in unloaded else None
    return PatientAssessmentResponse(
        id=a.id,
        anonymous_patient_id=a.anonymous_patient_id,
        doctor_id=a.doctor_id,
        company_id=a.company_id,
        doctor_name=doc.display_name if doc else None,
        company_name=comp.name if comp else None,
        age=a.age,
        sex=a.sex,
        height_cm=float(a.height_cm),
        weight_kg=float(a.weight_kg),
        bmi=float(a.bmi) if a.bmi else None,
        bp_systolic=a.bp_systolic,
        bp_diastolic=a.bp_diastolic,
        heart_rate=a.heart_rate,
        spo2=a.spo2,
        diabetes_status=a.diabetes_status,
        diabetic_complications=a.diabetic_complications or [],
        symptoms=a.symptoms or {},
        medicines=a.medicines or [],
        training_consent=a.training_consent,
        created_at=a.created_at,
        ai_summary=ai.ai_summary if ai else None,
        urgency=ai.urgency if ai else None,
        quality_status=ecg.quality_status if ecg else None,
        processing_status=ecg.processing_status if ecg else None,
        validation_status=val.status if val else None,
        report_code=rep.report_code if rep else None,
        report_status=rep.report_status if rep else None,
    )


@router.get("", response_model=List[PatientAssessmentResponse])
async def list_assessments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # MM Privacy Rule: MM MUST NEVER see patient assessments!
    if current_user.role == AppRole.marketing_manager:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Marketing Managers are restricted from viewing clinical patient assessments per privacy-by-design policy.",
        )

    stmt = (
        select(PatientAssessment)
        .options(
            selectinload(PatientAssessment.doctor),
            selectinload(PatientAssessment.company),
            selectinload(PatientAssessment.ai_result),
            selectinload(PatientAssessment.ecg_record),
            selectinload(PatientAssessment.validation),
            selectinload(PatientAssessment.report),
        )
    )
    if current_user.role == AppRole.doctor:
        stmt = stmt.where(PatientAssessment.doctor_id == current_user.id)

    stmt = stmt.order_by(PatientAssessment.created_at.desc())
    result = await db.execute(stmt)
    records = result.scalars().all()
    return [serialize_assessment(r) for r in records]


@router.get("/{assessment_id}", response_model=PatientAssessmentResponse)
async def get_assessment(
    assessment_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == AppRole.marketing_manager:
        raise HTTPException(status_code=403, detail="Access denied per privacy rules")

    stmt = (
        select(PatientAssessment)
        .options(
            selectinload(PatientAssessment.doctor),
            selectinload(PatientAssessment.company),
            selectinload(PatientAssessment.ai_result),
            selectinload(PatientAssessment.ecg_record),
            selectinload(PatientAssessment.validation),
            selectinload(PatientAssessment.report),
        )
        .where(PatientAssessment.id == assessment_id)
    )
    result = await db.execute(stmt)
    assessment = result.scalar_one_or_none()

    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    if current_user.role == AppRole.doctor and assessment.doctor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    return serialize_assessment(assessment)



@router.post("/{assessment_id}/validate", response_model=DoctorValidationResponse)
async def validate_ai_result(
    assessment_id: UUID,
    payload: DoctorValidationCreate,
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_doctor),
):
    # Fetch assessment and AI result
    stmt = select(PatientAssessment).options(selectinload(PatientAssessment.ai_result)).where(PatientAssessment.id == assessment_id)
    result = await db.execute(stmt)
    assessment = result.scalar_one_or_none()

    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    if doctor.role == AppRole.doctor and assessment.doctor_id != doctor.id:
        raise HTTPException(status_code=403, detail="Access denied")

    if not assessment.ai_result:
        raise HTTPException(status_code=400, detail="Cannot validate: AI result has not been generated for this assessment yet.")

    validation = DoctorValidation(
        ai_result_id=assessment.ai_result.id,
        assessment_id=assessment.id,
        doctor_id=doctor.id,
        company_id=doctor.company_id,
        status=payload.status,
        corrected_interpretation=payload.corrected_interpretation if payload.status == "correct" else None,
        notes=payload.notes,
    )

    db.add(validation)
    await db.flush()

    report_code = f"QX-R-{assessment.anonymous_patient_id.split('-')[-1]}" if "-" in assessment.anonymous_patient_id else f"QX-R-{str(assessment.id)[:6]}"
    report = Report(
        report_code=report_code,
        assessment_id=assessment.id,
        validation_id=validation.id,
        doctor_id=doctor.id,
        company_id=doctor.company_id,
        report_status="generated",
    )
    db.add(report)

    usage_event = UsageEvent(
        company_id=doctor.company_id,
        doctor_id=doctor.id,
        event_type="report_generated",
        analysis_status="generated",
    )
    db.add(usage_event)

    await db.commit()
    await db.refresh(validation)

    return validation
