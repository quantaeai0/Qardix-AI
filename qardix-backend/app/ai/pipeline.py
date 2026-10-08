"""
ECG Pipeline Orchestrator

This is the single entry point for the full ECG AI pipeline.
It coordinates all stages in order and returns a typed ECGAIResult.

COMPLETE FLOW (all stages local except model inference):

    ECG Image bytes
         │
         ▼
    1. Image Validation          [image_processor.validate_image]
         │
         ▼
    2. ECG Quality Check         [quality_check.perform_ecg_quality_check]
         │  (halt if needs_reupload)
         ▼
    3. Image Preprocessing       [image_processor.preprocess_ecg_image]
         │
         ▼
    4. ECG Digitisation          [digitiser.digitise_ecg]
         │
         ▼
    5. Waveform Validation       [digitiser.validate_waveform]
         │
         ▼
    6. Model Input Preparation   [model_input_builder.prepare_model_input]
         │
         ▼  ─────────────────── MODEL INFERENCE BOUNDARY ──────────────────────
         │
    7. Model Inference           [provider.predict(model_input)]
         │   MockInferenceProvider | ColabInferenceProvider | LocalInferenceProvider
         │
         ▼  ──────────────────────────────────────────────────────────────────
         │
    8. Prediction Normalisation  [prediction_normaliser.normalise_prediction]
         │
         ▼
    9. Urgency Classification    [urgency_engine.classify_urgency]
         │
         ▼
   10. Patient Explanation       [explanation_generator.generate_patient_explanation]
         │
         ▼
   11. AI Summary                [explanation_generator.build_ai_summary]
         │
         ▼
    ECGAIResult (returned to API layer)

To switch inference backend: change INFERENCE_BACKEND in .env.
No other code changes required.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from app.ai.schema import (
    ECGAIResult,
    QualityStatus,
    PipelineError,
    UrgencyLevel,
)
from app.ai.preprocessing.image_processor import validate_image, preprocess_ecg_image
from app.ai.preprocessing.digitiser import digitise_ecg, validate_waveform
from app.ai.preprocessing.model_input_builder import prepare_model_input
from app.ai.postprocessing.prediction_normaliser import normalise_prediction
from app.ai.postprocessing.urgency_engine import classify_urgency
from app.ai.postprocessing.explanation_generator import (
    generate_patient_explanation,
    build_ai_summary,
)
from app.ai.providers.base import ModelInferenceProvider
from app.ai.providers.factory import get_inference_provider
from app.services.quality_check import perform_ecg_quality_check

logger = logging.getLogger(__name__)


class ECGPipeline:
    """
    Full ECG AI pipeline.

    Usage:
        pipeline = ECGPipeline()                          # uses env-configured provider
        pipeline = ECGPipeline(provider=MockProvider())   # inject specific provider

    The provider can be injected for testing or swapped at runtime.
    """

    def __init__(self, provider: Optional[ModelInferenceProvider] = None):
        self.provider = provider or get_inference_provider()
        logger.info(f"ECGPipeline initialised with provider: {self.provider}")

    async def run(
        self,
        image_bytes: bytes,
        filename: str,
        clinical_context: Dict[str, Any],
        model_adapter: str = "deepecg_wcr77",
    ) -> ECGAIResult:
        """
        Execute the full pipeline.

        Args:
            image_bytes:      Raw uploaded ECG image bytes.
            filename:         Original filename (used for format validation).
            clinical_context: Dict with age, sex, vitals, symptoms, medicines.
            model_adapter:    Which model to request on the inference provider side.

        Returns:
            ECGAIResult — complete, structured AI result ready for DB storage and API response.

        Notes:
            - If image quality check fails → returns ECGAIResult with
              quality_status=NEEDS_REUPLOAD. No inference is run.
            - PipelineError from any stage is re-raised to the caller (ecg.py API route).
        """
        logger.info(f"Pipeline starting | provider={self.provider.provider_name} | file={filename}")

        # ── Stage 1: Image Validation ─────────────────────────────────────────
        logger.debug("Stage 1: Image validation")
        img_validation = validate_image(image_bytes, filename)
        if not img_validation.is_valid:
            raise PipelineError(
                stage="ImageValidation",
                reason=img_validation.reason or "Invalid image.",
            )

        # ── Stage 2: ECG Quality Check (existing service — reused, not duplicated) ──
        logger.debug("Stage 2: Quality check")
        quality_status_str, quality_reason = perform_ecg_quality_check(image_bytes)
        quality_status = QualityStatus(quality_status_str)

        if quality_status == QualityStatus.NEEDS_REUPLOAD:
            logger.info(f"Quality check failed: {quality_reason}")
            return _quality_failed_result(quality_reason)

        # ── Stage 3: Image Preprocessing ─────────────────────────────────────
        logger.debug("Stage 3: Preprocessing")
        preprocessed = preprocess_ecg_image(image_bytes)

        # ── Stage 4: ECG Digitisation ─────────────────────────────────────────
        logger.debug("Stage 4: Digitisation")
        digitiser_output = digitise_ecg(preprocessed)

        # ── Stage 5: Waveform Validation ──────────────────────────────────────
        logger.debug("Stage 5: Waveform validation")
        waveform_check = validate_waveform(digitiser_output)
        if not waveform_check.is_valid:
            raise PipelineError(
                stage="WaveformValidation",
                reason=waveform_check.reason or "Waveform validation failed.",
            )

        # ── Stage 6: Model Input Preparation ─────────────────────────────────
        logger.debug("Stage 6: Model input preparation")
        model_input = prepare_model_input(
            digitiser_output,
            clinical_context,
            model_adapter=model_adapter,
        )

        # ── Stage 7: Model Inference (provider-agnostic) ──────────────────────
        logger.info(f"Stage 7: Model inference via {self.provider.provider_name}")
        raw_prediction = await self.provider.predict(model_input)

        # ── Stage 8: Prediction Normalisation ────────────────────────────────
        logger.debug("Stage 8: Prediction normalisation")
        normalised = normalise_prediction(raw_prediction)

        # ── Stage 9: Urgency Classification ──────────────────────────────────
        logger.debug("Stage 9: Urgency classification")
        urgency_result = classify_urgency(normalised)

        # ── Stage 10: Patient Explanation & Warning Signs ─────────────────────
        logger.debug("Stage 10: Patient explanation")
        patient_explanation = generate_patient_explanation(normalised, urgency_result)

        # ── Stage 11: AI Summary (doctor-facing) ──────────────────────────────
        logger.debug("Stage 11: AI summary")
        ai_summary = build_ai_summary(normalised)

        logger.info(
            f"Pipeline complete | urgency={urgency_result.level.value} "
            f"| provider={raw_prediction.inference_provider} "
            f"| findings={len(normalised.findings)}"
        )

        return ECGAIResult(
            ai_summary=ai_summary,
            findings=normalised.findings,
            confidence_json={
                "overall": normalised.overall_confidence,
                **{f.label: f.probability for f in normalised.findings},
            },
            abnormal_leads=normalised.abnormal_leads,
            urgency=urgency_result.level,
            patient_explanation=patient_explanation.text,
            warning_signs=patient_explanation.warning_signs,
            quality_status=QualityStatus.ACCEPTED,
            quality_reason=None,
            raw_output_json={
                **raw_prediction.raw_output,
                "model_name": raw_prediction.model_name,
                "model_version": raw_prediction.model_version,
                "inference_provider": raw_prediction.inference_provider,
                "urgency_rules": urgency_result.triggered_rules,
                "digitiser_version": digitiser_output.digitiser_version,
            },
            model_version=raw_prediction.model_version,
            inference_provider=raw_prediction.inference_provider,
        )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _quality_failed_result(reason: Optional[str]) -> ECGAIResult:
    """Returns a minimal ECGAIResult for quality-check failures."""
    return ECGAIResult(
        ai_summary="ECG image quality check failed. No AI analysis was performed.",
        findings=[],
        confidence_json={},
        abnormal_leads=[],
        urgency=UrgencyLevel.ROUTINE,
        patient_explanation=(
            "The ECG image quality was insufficient for AI analysis. "
            "Please re-upload a clearer image following the upload guidelines."
        ),
        warning_signs=[
            "If you are experiencing symptoms, please contact your doctor immediately "
            "regardless of the upload issue."
        ],
        quality_status=QualityStatus.NEEDS_REUPLOAD,
        quality_reason=reason,
        raw_output_json={"error": "quality_check_failed", "reason": reason},
        model_version="none",
        inference_provider="none",
    )
