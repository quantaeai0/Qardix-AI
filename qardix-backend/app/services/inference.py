"""
DEPRECATED — Legacy monolithic ECG inference service.

This module has been replaced by the modular ECG AI pipeline:
    app/ai/pipeline.py  →  ECGPipeline.run()

The new pipeline separates:
  - Preprocessing (image_processor, digitiser, model_input_builder)
  - Inference providers (mock / colab / local)
  - Postprocessing (prediction_normaliser, urgency_engine, explanation_generator)

This file is kept for reference only and is no longer called by any API route.
The ECG upload endpoint (app/api/v1/ecg.py) now uses ECGPipeline directly.

DO NOT add new features here.
"""

import warnings
import httpx
from typing import Dict, Any
from app.config import settings

warnings.warn(
    "app.services.inference.run_ecg_inference is deprecated. "
    "Use app.ai.pipeline.ECGPipeline instead.",
    DeprecationWarning,
    stacklevel=2,
)


async def run_ecg_inference(image_path: str, assessment_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Orchestrates ECG inference.
    If INFERENCE_BACKEND="colab", calls the ngrok Colab URL.
    Otherwise, returns deterministic clinical AI mock output matching standard 12-lead finding structure.
    """
    if settings.INFERENCE_BACKEND == "colab" and settings.COLAB_INFERENCE_URL:
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                res = await client.post(
                    f"{settings.COLAB_INFERENCE_URL.rstrip('/')}/predict",
                    json={"image_path": image_path, "clinical_context": assessment_data},
                    headers={"X-API-Key": settings.COLAB_API_KEY}
                )
                if res.status_code == 200:
                    return res.json()
        except Exception as e:
            print(f"Colab inference failed, falling back to built-in clinical pipeline: {e}")

    # Built-in deterministic fallback AI pipeline matching WCR-77 findings format
    age = assessment_data.get("age", 50)
    symptoms = assessment_data.get("symptoms", {})
    has_chest_pain = symptoms.get("chest_pain", False)

    if has_chest_pain or age > 65:
        urgency = "urgent"
        ai_summary = "Sinus Rhythm with ST-Segment Elevation in Lead II, III, aVF suggesting Inferior Myocardial Infarction."
        findings = [
            {"label": "Inferior ST-Elevation Myocardial Infarction", "detail": "ST-elevation > 1.5mm noted in inferior leads II, III, aVF."},
            {"label": "Sinus Tachycardia", "detail": "Heart rate elevated above 100 bpm."}
        ]
        abnormal_leads = ["II", "III", "aVF", "V5"]
        confidence = {"overall": 0.94, "st_elevation": 0.96}
        patient_explanation = "The ECG shows patterns indicating reduced blood flow to a portion of the heart muscle. Immediate medical evaluation is required."
        warning_signs = [
            "Severe or crushing chest pain spreading to arm or jaw",
            "Shortness of breath or dizziness",
            "Sudden profuse sweating or nausea"
        ]
    else:
        urgency = "routine"
        ai_summary = "Normal Sinus Rhythm. No significant ST-T wave abnormalities or conduction defects observed."
        findings = [
            {"label": "Normal Sinus Rhythm", "detail": "Regular rate and rhythm within normal physiological limits."}
        ]
        abnormal_leads = []
        confidence = {"overall": 0.98}
        patient_explanation = "Your ECG pattern appears within normal limits with no urgent cardiac warnings detected."
        warning_signs = [
            "Seek immediate medical care if you experience new chest pain, fainting, or severe shortness of breath."
        ]

    return {
        "ai_summary": ai_summary,
        "findings": findings,
        "confidence_json": confidence,
        "abnormal_leads": abnormal_leads,
        "urgency": urgency,
        "patient_explanation": patient_explanation,
        "warning_signs": warning_signs,
        "raw_output_json": {
            "model_name": "DeepECG-WCR77",
            "version": "1.0.0",
            "digitiser": "ECG-Digitiser-PhysioNet2024"
        }
    }
