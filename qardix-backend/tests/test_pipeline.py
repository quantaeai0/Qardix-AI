"""
Tests for the ECG AI Pipeline

All tests use MockInferenceProvider so they run entirely locally —
no Colab connection, no model weights required.

Run with:
    pytest tests/ -v
    pytest tests/test_pipeline.py -v -s    # see print output

Test scenarios covered:
  - Pipeline runs end-to-end with mock provider
  - Quality check gate halts pipeline on bad image
  - Urgent scenario (chest pain patient) produces urgent urgency
  - Normal scenario produces routine urgency
  - Provider injection works (mock vs. different mock)
  - Schema dataclasses are correct
  - Prediction normaliser maps logits correctly
  - Urgency engine rules fire correctly
  - Patient explanation templates are selected correctly
"""

import asyncio
import io
import os
import sys
import pytest

# Ensure project root is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PIL import Image
import numpy as np
import cv2

from app.ai.schema import (
    UrgencyLevel, QualityStatus, ModelInput, RawPrediction,
    DigitizerOutput, NormalisedPrediction, Finding,
)
from app.ai.pipeline import ECGPipeline
from app.ai.providers.mock_provider import MockInferenceProvider
from app.ai.postprocessing.prediction_normaliser import normalise_prediction
from app.ai.postprocessing.urgency_engine import classify_urgency
from app.ai.postprocessing.explanation_generator import (
    generate_patient_explanation, build_ai_summary,
)
from app.ai.preprocessing.image_processor import validate_image, preprocess_ecg_image
from app.ai.preprocessing.digitiser import validate_waveform, DigitizerOutput


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _make_ecg_image(width: int = 800, height: int = 600, blur: bool = False) -> bytes:
    """Generate a synthetic ECG-like PNG image for testing."""
    img = np.ones((height, width, 3), dtype=np.uint8) * 255  # white background

    # Draw grid lines (ECG paper look)
    for x in range(0, width, 20):
        cv2.line(img, (x, 0), (x, height), (220, 200, 200), 1)
    for y in range(0, height, 20):
        cv2.line(img, (0, y), (width, y), (220, 200, 200), 1)

    # Draw a simple ECG waveform line
    points = []
    for i in range(0, width, 2):
        t = i / width * 10 * np.pi
        y_val = int(height // 2 + 50 * np.sin(t) + 30 * np.sin(3 * t))
        points.append((i, y_val))

    for i in range(len(points) - 1):
        cv2.line(img, points[i], points[i + 1], (0, 0, 0), 2)

    if blur:
        img = cv2.GaussianBlur(img, (25, 25), 0)

    _, buf = cv2.imencode(".png", img)
    return buf.tobytes()


NORMAL_CLINICAL_CONTEXT = {
    "age": 35,
    "sex": "Male",
    "height_cm": 175.0,
    "weight_kg": 70.0,
    "bmi": 22.9,
    "bp_systolic": 120,
    "bp_diastolic": 80,
    "heart_rate": 72,
    "spo2": 98,
    "diabetes_status": "Non-Diabetic",
    "diabetic_complications": [],
    "symptoms": {"chest_pain": False, "palpitation": False, "breathlessness": False, "syncope": False},
    "medicines": [],
}

URGENT_CLINICAL_CONTEXT = {
    **NORMAL_CLINICAL_CONTEXT,
    "age": 70,
    "symptoms": {"chest_pain": True, "palpitation": True, "breathlessness": True, "syncope": False},
}


# ── Image validation tests ────────────────────────────────────────────────────

class TestImageValidation:
    def test_valid_png_image(self):
        img_bytes = _make_ecg_image()
        result = validate_image(img_bytes, "ecg.png")
        assert result.is_valid is True
        assert result.width_px == 800
        assert result.height_px == 600

    def test_empty_bytes_invalid(self):
        result = validate_image(b"", "ecg.png")
        assert result.is_valid is False
        assert "empty" in result.reason.lower()

    def test_corrupted_bytes_invalid(self):
        result = validate_image(b"not_an_image", "ecg.png")
        assert result.is_valid is False

    def test_unsupported_extension(self):
        result = validate_image(b"some_bytes", "ecg.pdf")
        assert result.is_valid is False
        assert "pdf" in result.reason.lower()


# ── Preprocessing tests ───────────────────────────────────────────────────────

class TestPreprocessing:
    def test_preprocess_returns_bytes(self):
        img_bytes = _make_ecg_image()
        result = preprocess_ecg_image(img_bytes)
        assert isinstance(result.image_bytes, bytes)
        assert len(result.image_bytes) > 0

    def test_preprocess_detects_leads(self):
        img_bytes = _make_ecg_image()
        result = preprocess_ecg_image(img_bytes)
        assert len(result.detected_leads) == 12  # standard 12-lead

    def test_preprocess_metadata_present(self):
        img_bytes = _make_ecg_image()
        result = preprocess_ecg_image(img_bytes)
        assert "original_width" in result.metadata
        assert result.metadata["contrast_enhanced"] is True


# ── Waveform validation tests ─────────────────────────────────────────────────

class TestWaveformValidation:
    def test_valid_waveform(self):
        leads = {lead: list(np.sin(np.linspace(0, 10, 5000))) for lead in ["I", "II", "V1"]}
        output = DigitizerOutput(leads=leads, sample_rate_hz=500.0, duration_seconds=10.0)
        result = validate_waveform(output)
        assert result.is_valid is True

    def test_empty_leads_invalid(self):
        output = DigitizerOutput(leads={}, sample_rate_hz=500.0, duration_seconds=10.0)
        result = validate_waveform(output)
        assert result.is_valid is False
        assert result.detected_leads_count == 0

    def test_flat_leads_invalid(self):
        leads = {f"V{i}": [0.0] * 5000 for i in range(12)}
        output = DigitizerOutput(leads=leads, sample_rate_hz=500.0, duration_seconds=10.0)
        result = validate_waveform(output)
        assert result.is_valid is False


# ── Prediction normaliser tests ───────────────────────────────────────────────

class TestPredictionNormaliser:
    def _make_raw_normal(self) -> RawPrediction:
        return RawPrediction(
            logits={"Normal_sinus_rhythm": 0.98, "ST_elevation_MI": 0.01},
            top_findings=[{"label": "Normal_sinus_rhythm", "probability": 0.98}],
            model_name="test",
            model_version="0.0.1",
            inference_provider="mock",
        )

    def _make_raw_urgent(self) -> RawPrediction:
        return RawPrediction(
            logits={"ST_elevation_MI": 0.94, "Sinus_tachycardia": 0.87, "Normal_sinus_rhythm": 0.02},
            top_findings=[{"label": "ST_elevation_MI", "probability": 0.94}],
            model_name="test",
            model_version="0.0.1",
            inference_provider="mock",
        )

    def test_normal_finding_is_included(self):
        normalised = normalise_prediction(self._make_raw_normal())
        labels = [f.label for f in normalised.findings]
        assert "Normal Sinus Rhythm" in labels

    def test_urgent_findings_above_threshold(self):
        normalised = normalise_prediction(self._make_raw_urgent())
        labels = [f.label for f in normalised.findings]
        assert "ST-Elevation Myocardial Infarction" in labels

    def test_urgent_has_abnormal_leads(self):
        normalised = normalise_prediction(self._make_raw_urgent())
        assert len(normalised.abnormal_leads) > 0

    def test_normal_has_no_abnormal_leads(self):
        normalised = normalise_prediction(self._make_raw_normal())
        assert normalised.abnormal_leads == []

    def test_findings_sorted_by_probability(self):
        normalised = normalise_prediction(self._make_raw_urgent())
        probs = [f.probability for f in normalised.findings]
        assert probs == sorted(probs, reverse=True)


# ── Urgency engine tests ───────────────────────────────────────────────────────

class TestUrgencyEngine:
    def _make_normal_prediction(self) -> NormalisedPrediction:
        return NormalisedPrediction(
            findings=[Finding(label="Normal Sinus Rhythm", detail="", probability=0.98)],
            abnormal_leads=[],
            overall_confidence=0.98,
            model_name="test", model_version="0.0.1", inference_provider="mock",
        )

    def _make_urgent_prediction(self) -> NormalisedPrediction:
        return NormalisedPrediction(
            findings=[
                Finding(label="ST-Elevation Myocardial Infarction", detail="", probability=0.94),
                Finding(label="Sinus Tachycardia", detail="", probability=0.87),
            ],
            abnormal_leads=["II", "III", "aVF"],
            overall_confidence=0.94,
            model_name="test", model_version="0.0.1", inference_provider="mock",
        )

    def _make_review_soon_prediction(self) -> NormalisedPrediction:
        return NormalisedPrediction(
            findings=[Finding(label="Atrial Fibrillation", detail="", probability=0.75)],
            abnormal_leads=["I"],
            overall_confidence=0.75,
            model_name="test", model_version="0.0.1", inference_provider="mock",
        )

    def test_normal_is_routine(self):
        result = classify_urgency(self._make_normal_prediction())
        assert result.level == UrgencyLevel.ROUTINE

    def test_stemi_is_urgent(self):
        result = classify_urgency(self._make_urgent_prediction())
        assert result.level == UrgencyLevel.URGENT

    def test_afib_is_review_soon(self):
        result = classify_urgency(self._make_review_soon_prediction())
        assert result.level == UrgencyLevel.REVIEW_SOON

    def test_triggered_rules_populated(self):
        result = classify_urgency(self._make_urgent_prediction())
        assert len(result.triggered_rules) > 0


# ── Explanation generator tests ───────────────────────────────────────────────

class TestExplanationGenerator:
    def _urgent_inputs(self):
        from app.ai.schema import UrgencyResult
        pred = NormalisedPrediction(
            findings=[Finding(label="ST-Elevation Myocardial Infarction", detail="", probability=0.94)],
            abnormal_leads=[], overall_confidence=0.94,
            model_name="t", model_version="t", inference_provider="mock",
        )
        urgency = UrgencyResult(level=UrgencyLevel.URGENT, triggered_rules=["URGENT finding: ST-Elevation MI"])
        return pred, urgency

    def _routine_inputs(self):
        from app.ai.schema import UrgencyResult
        pred = NormalisedPrediction(
            findings=[Finding(label="Normal Sinus Rhythm", detail="", probability=0.98)],
            abnormal_leads=[], overall_confidence=0.98,
            model_name="t", model_version="t", inference_provider="mock",
        )
        urgency = UrgencyResult(level=UrgencyLevel.ROUTINE, triggered_rules=["No urgent findings."])
        return pred, urgency

    def test_urgent_explanation_present(self):
        pred, urgency = self._urgent_inputs()
        result = generate_patient_explanation(pred, urgency)
        assert len(result.text) > 50
        assert len(result.warning_signs) >= 3

    def test_routine_explanation_present(self):
        pred, urgency = self._routine_inputs()
        result = generate_patient_explanation(pred, urgency)
        assert "normal limits" in result.text.lower() or "routine" in result.text.lower()

    def test_warning_signs_always_present(self):
        pred, urgency = self._routine_inputs()
        result = generate_patient_explanation(pred, urgency)
        assert len(result.warning_signs) > 0

    def test_urgent_has_emergency_warning(self):
        pred, urgency = self._urgent_inputs()
        result = generate_patient_explanation(pred, urgency)
        combined = " ".join(result.warning_signs).lower()
        assert "emergency" in combined or "immediate" in combined or "112" in combined

    def test_ai_summary_contains_finding(self):
        pred, _ = self._urgent_inputs()
        summary = build_ai_summary(pred)
        assert "ST-Elevation" in summary or "AI-assisted" in summary


# ── Full pipeline integration tests ──────────────────────────────────────────

class TestPipelineIntegration:
    """End-to-end pipeline tests using MockInferenceProvider."""

    def test_pipeline_normal_scenario(self):
        """Normal patient, sharp image → routine result."""
        img_bytes = _make_ecg_image(blur=False)
        pipeline = ECGPipeline(provider=MockInferenceProvider())
        result = asyncio.get_event_loop().run_until_complete(
            pipeline.run(img_bytes, "ecg.png", NORMAL_CLINICAL_CONTEXT)
        )
        assert result.quality_status == QualityStatus.ACCEPTED
        assert result.urgency in (UrgencyLevel.ROUTINE, UrgencyLevel.REVIEW_SOON)
        assert len(result.ai_summary) > 20
        assert len(result.patient_explanation) > 20
        assert len(result.warning_signs) > 0
        assert result.clinical_disclaimer != ""

    def test_pipeline_urgent_scenario(self):
        """Older patient with chest pain → urgent result."""
        img_bytes = _make_ecg_image(blur=False)
        pipeline = ECGPipeline(provider=MockInferenceProvider())
        result = asyncio.get_event_loop().run_until_complete(
            pipeline.run(img_bytes, "ecg.png", URGENT_CLINICAL_CONTEXT)
        )
        assert result.quality_status == QualityStatus.ACCEPTED
        assert result.urgency == UrgencyLevel.URGENT

    def test_pipeline_blurry_image_quality_fails(self):
        """Very blurry image → quality_status=needs_reupload, no AI result."""
        img_bytes = _make_ecg_image(blur=True)
        pipeline = ECGPipeline(provider=MockInferenceProvider())
        result = asyncio.get_event_loop().run_until_complete(
            pipeline.run(img_bytes, "ecg.png", NORMAL_CLINICAL_CONTEXT)
        )
        assert result.quality_status == QualityStatus.NEEDS_REUPLOAD
        assert result.urgency == UrgencyLevel.ROUTINE  # default safe value

    def test_pipeline_result_has_raw_output_json(self):
        """raw_output_json must always be preserved (for audit)."""
        img_bytes = _make_ecg_image(blur=False)
        pipeline = ECGPipeline(provider=MockInferenceProvider())
        result = asyncio.get_event_loop().run_until_complete(
            pipeline.run(img_bytes, "ecg.png", NORMAL_CLINICAL_CONTEXT)
        )
        assert isinstance(result.raw_output_json, dict)
        assert "inference_provider" in result.raw_output_json

    def test_pipeline_inference_provider_is_mock(self):
        """Provider should be identified in the result."""
        img_bytes = _make_ecg_image(blur=False)
        pipeline = ECGPipeline(provider=MockInferenceProvider())
        result = asyncio.get_event_loop().run_until_complete(
            pipeline.run(img_bytes, "ecg.png", NORMAL_CLINICAL_CONTEXT)
        )
        assert result.inference_provider == "mock"

    def test_pipeline_clinical_disclaimer_always_present(self):
        """Clinical disclaimer must always be on the result — non-negotiable."""
        img_bytes = _make_ecg_image(blur=False)
        pipeline = ECGPipeline(provider=MockInferenceProvider())
        result = asyncio.get_event_loop().run_until_complete(
            pipeline.run(img_bytes, "ecg.png", NORMAL_CLINICAL_CONTEXT)
        )
        assert "treating doctor" in result.clinical_disclaimer.lower()

    def test_provider_injection(self):
        """Two different provider instances can be injected independently."""
        img_bytes = _make_ecg_image(blur=False)
        p1 = ECGPipeline(provider=MockInferenceProvider())
        p2 = ECGPipeline(provider=MockInferenceProvider())
        # Both should succeed; result structure should be equivalent
        r1 = asyncio.get_event_loop().run_until_complete(
            p1.run(img_bytes, "ecg.png", NORMAL_CLINICAL_CONTEXT)
        )
        r2 = asyncio.get_event_loop().run_until_complete(
            p2.run(img_bytes, "ecg.png", NORMAL_CLINICAL_CONTEXT)
        )
        assert r1.quality_status == r2.quality_status
        assert r1.urgency == r2.urgency
