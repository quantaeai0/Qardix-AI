from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from uuid import UUID

from app.database.connection import get_db
from app.models.models import PatientAssessment, EcgRecord, AiResult, User, ProcessingStatus, AppRole
from app.services.storage import storage_service
from app.services.quality_check import perform_ecg_quality_check
from app.services.inference import run_ecg_inference
from app.auth.dependencies import require_doctor, get_current_user

router = APIRouter(prefix="/ecg", tags=["ECG Processing & AI"])


@router.post("/upload")
async def upload_and_process_ecg(
    assessment_id: UUID = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_doctor),
):
    # Fetch assessment
    stmt = select(PatientAssessment).where(PatientAssessment.id == assessment_id)
    assessment = (await db.execute(stmt)).scalar_one_or_none()

    if not assessment:
        raise HTTPException(status_code=404, detail="Patient Assessment not found")

    if doctor.role == AppRole.doctor and assessment.doctor_id != doctor.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Read image bytes
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    # 1. Perform OpenCV Quality Check
    quality_status, quality_reason = perform_ecg_quality_check(image_bytes)

    # 2. Upload to Supabase Storage
    try:
        storage_path = await storage_service.upload_ecg_image(image_bytes, file.filename or "ecg.png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload image to Supabase Storage: {str(e)}")

    # Create EcgRecord
    ecg_record = EcgRecord(
        assessment_id=assessment.id,
        doctor_id=doctor.id,
        company_id=doctor.company_id,
        image_path=storage_path,
        quality_status=quality_status,
        quality_reason=quality_reason,
        processing_status=ProcessingStatus.completed if quality_status == "accepted" else ProcessingStatus.quality_failed,
        model_version="DeepECG-WCR77",
    )
    db.add(ecg_record)
    await db.commit()
    await db.refresh(ecg_record)

    if quality_status == "needs_reupload":
        return {
            "ecg_record_id": str(ecg_record.id),
            "quality_status": quality_status,
            "quality_reason": quality_reason,
            "image_url": storage_service.get_public_url(storage_path),
            "ai_result": None
        }

    # 3. Trigger AI Inference if quality accepted
    assessment_dict = {
        "age": assessment.age,
        "sex": assessment.sex,
        "bp_systolic": assessment.bp_systolic,
        "bp_diastolic": assessment.bp_diastolic,
        "heart_rate": assessment.heart_rate,
        "symptoms": assessment.symptoms,
        "medicines": assessment.medicines,
    }

    ai_output = await run_ecg_inference(storage_path, assessment_dict)

    ai_result = AiResult(
        ecg_record_id=ecg_record.id,
        assessment_id=assessment.id,
        doctor_id=doctor.id,
        company_id=doctor.company_id,
        ai_summary=ai_output["ai_summary"],
        findings=ai_output["findings"],
        confidence_json=ai_output["confidence_json"],
        abnormal_leads=ai_output["abnormal_leads"],
        urgency=ai_output["urgency"],
        patient_explanation=ai_output["patient_explanation"],
        warning_signs=ai_output["warning_signs"],
        raw_output_json=ai_output["raw_output_json"],
    )

    db.add(ai_result)
    await db.commit()
    await db.refresh(ai_result)

    return {
        "ecg_record_id": str(ecg_record.id),
        "quality_status": quality_status,
        "quality_reason": None,
        "image_url": storage_service.get_public_url(storage_path),
        "ai_result": {
            "id": str(ai_result.id),
            "ai_summary": ai_result.ai_summary,
            "findings": ai_result.findings,
            "confidence_json": ai_result.confidence_json,
            "abnormal_leads": ai_result.abnormal_leads,
            "urgency": ai_result.urgency,
            "patient_explanation": ai_result.patient_explanation,
            "warning_signs": ai_result.warning_signs,
        }
    }


@router.get("/{assessment_id}")
async def get_ecg_and_ai_result(
    assessment_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == AppRole.marketing_manager:
        raise HTTPException(status_code=403, detail="Marketing Managers are not permitted to view ECG images or AI findings per privacy rules.")

    stmt = select(EcgRecord).options(selectinload(EcgRecord.ai_result)).where(EcgRecord.assessment_id == assessment_id)
    ecg = (await db.execute(stmt)).scalar_one_or_none()

    if not ecg:
        raise HTTPException(status_code=404, detail="ECG record not found")

    if current_user.role == AppRole.doctor and ecg.doctor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    return {
        "ecg_record_id": str(ecg.id),
        "quality_status": ecg.quality_status,
        "quality_reason": ecg.quality_reason,
        "image_url": storage_service.get_public_url(ecg.image_path) if ecg.image_path else None,
        "ai_result": {
            "id": str(ecg.ai_result.id),
            "ai_summary": ecg.ai_result.ai_summary,
            "findings": ecg.ai_result.findings,
            "confidence_json": ecg.ai_result.confidence_json,
            "abnormal_leads": ecg.ai_result.abnormal_leads,
            "urgency": ecg.ai_result.urgency,
            "patient_explanation": ecg.ai_result.patient_explanation,
            "warning_signs": ecg.ai_result.warning_signs,
        } if ecg.ai_result else None
    }
