"""
ECG Processing & AI Endpoints

Updated to use the new ECGPipeline orchestrator.
The old run_ecg_inference() call is replaced by ECGPipeline.run().

All pipeline stages (quality check, preprocessing, digitisation,
waveform validation, model inference, postprocessing) are now
properly abstracted and testable.

Clinical safety:
  - AI output is always labelled AI-assisted.
  - Doctor validation is required before report generation.
  - MM is blocked from accessing ECG images and AI findings.
"""

import asyncio
import logging
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload
from uuid import UUID

from app.database.connection import get_db, AsyncSessionLocal
from app.models.models import PatientAssessment, EcgRecord, AiResult, User, ProcessingStatus, AppRole, UsageEvent
from app.services.storage import storage_service
from app.services.quality_check import perform_ecg_quality_check
from app.ai.pipeline import ECGPipeline
from app.ai.schema import QualityStatus, PipelineError
from app.auth.dependencies import require_doctor, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ecg", tags=["ECG Processing & AI"])


async def _enrich_clinical_report_bg(
    ai_result_id: UUID,
    findings_data: list,
    urgency_level: str,
    urgency_rules: list,
    overall_confidence: float,
    abnormal_leads: list,
    model_name: str,
    model_version: str,
    inference_provider: str,
    clinical_context: dict,
) -> None:
    """
    Background task — runs AFTER the HTTP response is already sent to the frontend.
    Calls Groq to generate a richer clinical_report and patches it in the DB.
    Safe no-op if Groq fails, times out, or key is missing.
    """
    try:
        from app.ai.llm.clinical_reasoning import generate_clinical_intelligence_report
        from app.ai.schema import NormalisedPrediction, Finding, UrgencyResult, UrgencyLevel
        from app.config import settings

        if not settings.GROQ_API_KEY or settings.GROQ_API_KEY in ("", "PASTE_YOUR_GROQ_API_KEY_HERE"):
            return  # No key — deterministic fallback already saved, nothing to do

        findings = [
            Finding(
                label=f["label"], detail=f.get("detail", ""),
                probability=f["probability"], affected_leads=f.get("affected_leads", []),
            )
            for f in findings_data
        ]
        normalised = NormalisedPrediction(
            findings=findings,
            abnormal_leads=abnormal_leads,
            overall_confidence=overall_confidence,
            model_name=model_name,
            model_version=model_version,
            inference_provider=inference_provider,
        )
        level_map = {
            "urgent": UrgencyLevel.URGENT,
            "review_soon": UrgencyLevel.REVIEW_SOON,
            "routine": UrgencyLevel.ROUTINE,
        }
        urgency = UrgencyResult(
            level=level_map.get(urgency_level, UrgencyLevel.ROUTINE),
            triggered_rules=urgency_rules,
        )

        groq_report = await asyncio.wait_for(
            generate_clinical_intelligence_report(normalised, urgency, clinical_context),
            timeout=18.0,
        )

        if groq_report.get("generated_by") != "groq":
            return  # Groq didn't fire — deterministic result already in DB

        # Patch the DB record with the Groq-enriched clinical_report
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(AiResult).where(AiResult.id == ai_result_id)
            )
            ai_rec = result.scalar_one_or_none()
            if ai_rec and ai_rec.raw_output_json:
                patched = dict(ai_rec.raw_output_json)
                patched["clinical_report"] = groq_report
                ai_rec.raw_output_json = patched
                await session.commit()
                logger.info(f"Groq background enrichment saved for ai_result={ai_result_id}")

    except asyncio.TimeoutError:
        logger.warning(f"Groq background task timed out for ai_result={ai_result_id}")
    except Exception as exc:
        logger.warning(f"Groq background task failed for ai_result={ai_result_id}: {exc}")


@router.post("/quality-check")
async def check_ecg_quality(
    file: UploadFile = File(...),
    doctor: User = Depends(require_doctor),
):
    """
    Real-time OpenCV quality gate pre-check.
    Evaluates image decodability, resolution, and Laplacian blur score.
    Returns:
        {
            "quality_status": "accepted" | "needs_reupload",
            "quality_reason": str | None
        }
    """
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    quality_status, quality_reason = perform_ecg_quality_check(image_bytes)
    return {
        "quality_status": quality_status,
        "quality_reason": quality_reason,
    }


@router.post("/upload")
async def upload_and_process_ecg(
    assessment_id: UUID = Form(...),
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_doctor),
):
    """
    Upload ECG image and run the full AI pipeline.

    Flow:
      1. Fetch assessment
      2. Read image bytes
      3. Run ECGPipeline (quality → preprocess → digitise → infer → postprocess)
      4. Upload image to Supabase Storage
      5. Persist EcgRecord + AiResult to DB
      6. Return structured result to frontend

    Returns quality_status=needs_reupload if image fails quality check.
    """
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

    # Build clinical context for the pipeline
    clinical_context = {
        "age":                    assessment.age,
        "sex":                    assessment.sex,
        "height_cm":              float(assessment.height_cm),
        "weight_kg":              float(assessment.weight_kg),
        "bmi":                    float(assessment.bmi) if assessment.bmi else None,
        "bp_systolic":            assessment.bp_systolic,
        "bp_diastolic":           assessment.bp_diastolic,
        "heart_rate":             assessment.heart_rate,
        "spo2":                   assessment.spo2,
        "diabetes_status":        assessment.diabetes_status,
        "diabetic_complications": assessment.diabetic_complications or [],
        "symptoms":               assessment.symptoms or {},
        "medicines":              assessment.medicines or [],
    }

    # ── Run ECG Pipeline ──────────────────────────────────────────────────────
    pipeline = ECGPipeline()  # provider selected from INFERENCE_BACKEND env var
    try:
        ai_result_data = await pipeline.run(
            image_bytes=image_bytes,
            filename=file.filename or "ecg.png",
            clinical_context=clinical_context,
            deterministic_only=True,
        )
    except PipelineError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"ECG pipeline error [{exc.stage}]: {exc.reason}",
        )

    # ── Upload image to Supabase Storage ──────────────────────────────────────
    try:
        storage_path = await storage_service.upload_ecg_image(
            image_bytes, file.filename or "ecg.png"
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload ECG image to storage: {str(exc)}",
        )

    # ── Persist EcgRecord ─────────────────────────────────────────────────────
    processing_status = (
        ProcessingStatus.completed
        if ai_result_data.quality_status == QualityStatus.ACCEPTED
        else ProcessingStatus.quality_failed
    )

    ecg_record = EcgRecord(
        assessment_id=assessment.id,
        doctor_id=doctor.id,
        company_id=doctor.company_id,
        image_path=storage_path,
        quality_status=ai_result_data.quality_status.value,
        quality_reason=ai_result_data.quality_reason,
        processing_status=processing_status,
        model_version=ai_result_data.model_version,
    )
    db.add(ecg_record)
    await db.commit()
    await db.refresh(ecg_record)

    # Return early if quality failed — no AI result to save
    if ai_result_data.quality_status == QualityStatus.NEEDS_REUPLOAD:
        return {
            "ecg_record_id": str(ecg_record.id),
            "quality_status": ai_result_data.quality_status.value,
            "quality_reason": ai_result_data.quality_reason,
            "image_url": storage_service.get_public_url(storage_path),
            "ai_result": None,
        }

    # ── Persist AiResult ──────────────────────────────────────────────────────
    ai_record = AiResult(
        ecg_record_id=ecg_record.id,
        assessment_id=assessment.id,
        doctor_id=doctor.id,
        company_id=doctor.company_id,
        ai_summary=ai_result_data.ai_summary,
        findings=[
            {"label": f.label, "detail": f.detail, "probability": f.probability,
             "affected_leads": f.affected_leads}
            for f in ai_result_data.findings
        ],
        confidence_json=ai_result_data.confidence_json,
        abnormal_leads=ai_result_data.abnormal_leads,
        urgency=ai_result_data.urgency.value,
        patient_explanation=ai_result_data.patient_explanation,
        warning_signs=ai_result_data.warning_signs,
        raw_output_json=ai_result_data.raw_output_json,
    )
    db.add(ai_record)

    # Record analytics usage event for MM dashboard
    usage_event = UsageEvent(
        company_id=doctor.company_id,
        doctor_id=doctor.id,
        event_type="analysis_completed",
        analysis_status=processing_status.value,
    )
    db.add(usage_event)

    await db.commit()
    await db.refresh(ai_record)

    # ── Schedule Groq enrichment in background (non-blocking) ─────────────────
    # The deterministic clinical_report is already saved above.
    # Groq will patch it asynchronously after the response is sent.
    background_tasks.add_task(
        _enrich_clinical_report_bg,
        ai_result_id=ai_record.id,
        findings_data=[
            {"label": f.label, "detail": f.detail, "probability": f.probability,
             "affected_leads": f.affected_leads}
            for f in ai_result_data.findings
        ],
        urgency_level=ai_result_data.urgency.value,
        urgency_rules=ai_result_data.raw_output_json.get("urgency_rules", []),
        overall_confidence=ai_result_data.confidence_json.get("overall", 0.5),
        abnormal_leads=ai_result_data.abnormal_leads,
        model_name=ai_result_data.raw_output_json.get("model_name", "deepecg"),
        model_version=ai_result_data.model_version,
        inference_provider=ai_result_data.inference_provider,
        clinical_context=clinical_context,
    )
    logger.info(f"Groq enrichment scheduled in background for ai_result={ai_record.id}")

    return {
        "ecg_record_id": str(ecg_record.id),
        "quality_status": ai_result_data.quality_status.value,
        "quality_reason": None,
        "image_url": storage_service.get_public_url(storage_path),
        "ai_result": {
            "id":                  str(ai_record.id),
            "ai_summary":          ai_record.ai_summary,
            "findings":            ai_record.findings,
            "confidence_json":     ai_record.confidence_json,
            "abnormal_leads":      ai_record.abnormal_leads,
            "urgency":             ai_record.urgency,
            "patient_explanation": ai_record.patient_explanation,
            "warning_signs":       ai_record.warning_signs,
            "inference_provider":  ai_result_data.inference_provider,
            "model_version":       ai_result_data.model_version,
            "clinical_disclaimer": ai_result_data.clinical_disclaimer,
            "clinical_report":     ai_result_data.raw_output_json.get("clinical_report"),
        },
    }


@router.get("/{assessment_id}")
async def get_ecg_and_ai_result(
    assessment_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch ECG record and AI result for an assessment."""
    if current_user.role == AppRole.marketing_manager:
        raise HTTPException(
            status_code=403,
            detail="Marketing Managers are not permitted to view ECG images or AI findings per privacy rules.",
        )

    stmt = select(EcgRecord).options(selectinload(EcgRecord.ai_result)).where(
        EcgRecord.assessment_id == assessment_id
    )
    ecg = (await db.execute(stmt)).scalar_one_or_none()

    if not ecg:
        raise HTTPException(status_code=404, detail="ECG record not found")

    if current_user.role == AppRole.doctor and ecg.doctor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    return {
        "ecg_record_id":   str(ecg.id),
        "quality_status":  ecg.quality_status,
        "quality_reason":  ecg.quality_reason,
        "image_url": storage_service.get_public_url(ecg.image_path) if ecg.image_path else None,
        "ai_result": {
            "id":                  str(ecg.ai_result.id),
            "ai_summary":          ecg.ai_result.ai_summary,
            "findings":            ecg.ai_result.findings,
            "confidence_json":     ecg.ai_result.confidence_json,
            "abnormal_leads":      ecg.ai_result.abnormal_leads,
            "urgency":             ecg.ai_result.urgency,
            "patient_explanation": ecg.ai_result.patient_explanation,
            "warning_signs":       ecg.ai_result.warning_signs,
            "clinical_report":     (ecg.ai_result.raw_output_json or {}).get("clinical_report"),
        } if ecg.ai_result else None,
    }
