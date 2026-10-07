from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List, Optional
from uuid import UUID
import random
import string
from datetime import datetime

from app.database.connection import get_db
from app.models.models import PatientAssessment, DoctorValidation, AiResult, User, AppRole
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

    return assessment


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

    stmt = select(PatientAssessment)
    if current_user.role == AppRole.doctor:
        stmt = stmt.where(PatientAssessment.doctor_id == current_user.id)

    stmt = stmt.order_by(PatientAssessment.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{assessment_id}", response_model=PatientAssessmentResponse)
async def get_assessment(
    assessment_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == AppRole.marketing_manager:
        raise HTTPException(status_code=403, detail="Access denied per privacy rules")

    stmt = select(PatientAssessment).where(PatientAssessment.id == assessment_id)
    result = await db.execute(stmt)
    assessment = result.scalar_one_or_none()

    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    if current_user.role == AppRole.doctor and assessment.doctor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    return assessment


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
    await db.commit()
    await db.refresh(validation)

    return validation
