"""
Stage 12 — Groq Clinical Reasoning Tests
=========================================

Tests for app/ai/llm/clinical_reasoning.py

Validates:
  - Deterministic fallback produces a valid, complete schema (no Groq key needed)
  - All 4 lead groups always present in lead_wise_review
  - clinical_correlations generated for each patient risk factor
  - quantitative_metrics uses heart_rate from clinical_context
  - Urgency level correctly reflected in clinical_priority
  - Fallback when GROQ_API_KEY is absent
  - Groq timeout triggers fallback (mocked)
  - Pipeline.run() result includes clinical_report key in raw_output_json
"""

import asyncio
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch, MagicMock

from app.ai.llm.clinical_reasoning import (
    generate_clinical_intelligence_report,
    _deterministic_fallback,
    _readable,
)
from app.ai.schema import (
    NormalisedPrediction,
    Finding,
    UrgencyResult,
    UrgencyLevel,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _make_normalised(urgency_level: UrgencyLevel = UrgencyLevel.REVIEW_SOON) -> NormalisedPrediction:
    return NormalisedPrediction(
        findings=[
            Finding(label="Atrial_fibrillation", detail="Possible AF pattern", probability=0.78,
                    affected_leads=["II", "V1"]),
            Finding(label="ST_depression", detail="Possible ST depression", probability=0.61,
                    affected_leads=["V4", "V5"]),
        ],
        abnormal_leads=["II", "V1", "V4", "V5"],
        overall_confidence=0.78,
        model_name="mock_deepecg_wcr77",
        model_version="mock-1.0.0",
        inference_provider="mock",
    )


def _make_urgency(level: UrgencyLevel = UrgencyLevel.REVIEW_SOON) -> UrgencyResult:
    return UrgencyResult(
        level=level,
        triggered_rules=["Review finding: Atrial Fibrillation"],
    )


CLINICAL_CTX = {
    "age": 62,
    "sex": "Male",
    "height_cm": 175.0,
    "weight_kg": 82.0,
    "bmi": 26.8,
    "bp_systolic": 152,
    "bp_diastolic": 94,
    "heart_rate": 88,
    "spo2": 96,
    "diabetes_status": "Type 2 Diabetes",
    "diabetic_complications": [],
    "symptoms": {"chest_pain": False, "breathlessness": True, "palpitation": True, "syncope": False},
    "medicines": ["Beta Blocker", "Anticoagulant"],
}


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestDeterministicFallback:
    """Deterministic fallback must produce a complete valid schema without any external calls."""

    def _run(self, urgency_level=UrgencyLevel.REVIEW_SOON):
        return _deterministic_fallback(
            _make_normalised(urgency_level),
            _make_urgency(urgency_level),
            CLINICAL_CTX,
            prior_ecg=None,
        )

    def test_all_required_keys_present(self):
        report = self._run()
        required_keys = [
            "ecg_impression", "overall_confidence", "clinical_priority",
            "clinical_priority_reason", "diagnostic_pills", "quantitative_metrics",
            "top_ai_findings", "findings_requiring_attention", "lead_wise_review",
            "clinical_correlations", "previous_ecg_comparison", "red_flag_review",
            "patient_communication_summary", "patient_explanation", "warning_signs",
        ]
        for key in required_keys:
            assert key in report, f"Missing required key: {key}"

    def test_all_four_lead_groups_present(self):
        report = self._run()
        groups = {row["lead_group"] for row in report["lead_wise_review"]}
        assert "I / aVL" in groups
        assert "II / III / aVF" in groups
        assert "V1-V3" in groups
        assert "V4-V6" in groups

    def test_heart_rate_from_clinical_context(self):
        report = self._run()
        assert report["quantitative_metrics"]["heart_rate_bpm"] == CLINICAL_CTX["heart_rate"]

    def test_clinical_priority_maps_urgency(self):
        assert self._run(UrgencyLevel.URGENT)["clinical_priority"] == "URGENT"
        assert self._run(UrgencyLevel.REVIEW_SOON)["clinical_priority"] == "REVIEW_SOON"
        assert self._run(UrgencyLevel.ROUTINE)["clinical_priority"] == "ROUTINE"

    def test_clinical_correlations_includes_bp_and_diabetes(self):
        report = self._run()
        factors = {row["clinical_factor"] for row in report["clinical_correlations"]}
        assert "Blood Pressure" in factors
        assert "Diabetes" in factors

    def test_clinical_correlations_includes_active_symptoms(self):
        report = self._run()
        factors = {row["clinical_factor"] for row in report["clinical_correlations"]}
        assert "Breathlessness" in factors
        assert "Palpitation" in factors

    def test_diagnostic_pills_not_empty(self):
        report = self._run()
        assert len(report["diagnostic_pills"]) >= 1
        for pill in report["diagnostic_pills"]:
            assert "label" in pill
            assert "tone" in pill
            assert pill["tone"] in ("normal", "warning", "urgent")

    def test_warning_signs_not_empty(self):
        report = self._run()
        assert isinstance(report["warning_signs"], list)
        assert len(report["warning_signs"]) >= 1


class TestGenerateClinicalIntelligenceReport:
    """generate_clinical_intelligence_report() must always return a valid report."""

    @pytest.mark.asyncio
    async def test_returns_fallback_when_no_groq_key(self):
        """With no GROQ_API_KEY, the deterministic fallback should run silently."""
        with patch("app.ai.llm.clinical_reasoning.settings") as mock_settings:
            mock_settings.GROQ_API_KEY = ""
            mock_settings.GROQ_MODEL = "qwen/qwen3-27b"
            report = await generate_clinical_intelligence_report(
                _make_normalised(), _make_urgency(), CLINICAL_CTX
            )
        assert "ecg_impression" in report
        assert report.get("generated_by") == "deterministic_fallback"

    @pytest.mark.asyncio
    async def test_returns_fallback_when_groq_placeholder_key(self):
        with patch("app.ai.llm.clinical_reasoning.settings") as mock_settings:
            mock_settings.GROQ_API_KEY = "PASTE_YOUR_GROQ_API_KEY_HERE"
            mock_settings.GROQ_MODEL = "qwen/qwen3-27b"
            report = await generate_clinical_intelligence_report(
                _make_normalised(), _make_urgency(), CLINICAL_CTX
            )
        assert report.get("generated_by") == "deterministic_fallback"

    @pytest.mark.asyncio
    async def test_groq_timeout_triggers_fallback(self):
        """A simulated 20s timeout must silently fall back, not raise."""
        with patch("app.ai.llm.clinical_reasoning.settings") as mock_settings:
            mock_settings.GROQ_API_KEY = "gsk_fake_key_for_test"
            mock_settings.GROQ_MODEL = "qwen/qwen3-27b"
            with patch("app.ai.llm.clinical_reasoning._call_groq",
                       side_effect=asyncio.TimeoutError):
                report = await generate_clinical_intelligence_report(
                    _make_normalised(), _make_urgency(), CLINICAL_CTX
                )
        assert "ecg_impression" in report
        assert report.get("generated_by") == "deterministic_fallback"

    @pytest.mark.asyncio
    async def test_groq_exception_triggers_fallback(self):
        """Any exception from Groq must silently fall back."""
        with patch("app.ai.llm.clinical_reasoning.settings") as mock_settings:
            mock_settings.GROQ_API_KEY = "gsk_fake_key_for_test"
            mock_settings.GROQ_MODEL = "qwen/qwen3-27b"
            with patch("app.ai.llm.clinical_reasoning._call_groq",
                       side_effect=RuntimeError("Connection refused")):
                report = await generate_clinical_intelligence_report(
                    _make_normalised(), _make_urgency(), CLINICAL_CTX
                )
        assert "ecg_impression" in report


class TestPipelineClinicalReportIntegration:
    """
    End-to-end: pipeline.run() must include clinical_report in raw_output_json.
    """

    @pytest.mark.asyncio
    async def test_pipeline_result_includes_clinical_report(self):
        """Pipeline result raw_output_json must contain the clinical_report key."""
        import numpy as np
        import cv2
        from app.ai.pipeline import ECGPipeline
        from app.ai.providers.mock_provider import MockInferenceProvider

        # Build a sharp ECG-like image that passes the quality gate
        img = np.ones((600, 1200, 3), dtype=np.uint8) * 255
        for x in range(0, 1200, 20):
            cv2.line(img, (x, 0), (x, 600), (220, 200, 200), 1)
        for y in range(0, 600, 20):
            cv2.line(img, (0, y), (1200, y), (220, 200, 200), 1)
        for i in range(0, 1200 - 2, 2):
            t = i / 1200 * 10 * np.pi
            y_val = int(300 + 50 * np.sin(t) + 30 * np.sin(3 * t))
            cv2.line(img, (i, y_val), (i + 2, y_val), (0, 0, 0), 2)
        _, buf = cv2.imencode(".png", img)
        image_bytes = buf.tobytes()

        ctx = {
            "age": 45, "sex": "Female",
            "height_cm": 165.0, "weight_kg": 65.0, "bmi": 23.9,
            "bp_systolic": 118, "bp_diastolic": 76,
            "heart_rate": 72, "spo2": 98,
            "diabetes_status": "Non-Diabetic",
            "diabetic_complications": [],
            "symptoms": {"chest_pain": False, "breathlessness": False,
                         "palpitation": False, "syncope": False},
            "medicines": [],
        }

        pipeline = ECGPipeline(provider=MockInferenceProvider())
        result = await pipeline.run(image_bytes=image_bytes, filename="test.png", clinical_context=ctx)

        assert "clinical_report" in result.raw_output_json
        cr = result.raw_output_json["clinical_report"]
        assert "ecg_impression" in cr
        assert "quantitative_metrics" in cr
        assert "lead_wise_review" in cr
        assert len(cr["lead_wise_review"]) == 4  # all 4 groups always present
        assert cr["quantitative_metrics"]["heart_rate_bpm"] == 72

    @pytest.mark.asyncio
    async def test_pipeline_clinical_report_has_correct_priority_for_urgent(self):
        """Urgent scenario (chest_pain=True, age>65) must produce URGENT clinical_priority."""
        import numpy as np
        import cv2
        from app.ai.pipeline import ECGPipeline
        from app.ai.providers.mock_provider import MockInferenceProvider

        img = np.ones((600, 1200, 3), dtype=np.uint8) * 255
        for x in range(0, 1200, 20):
            cv2.line(img, (x, 0), (x, 600), (220, 200, 200), 1)
        for y in range(0, 600, 20):
            cv2.line(img, (0, y), (1200, y), (220, 200, 200), 1)
        for i in range(0, 1200 - 2, 2):
            t = i / 1200 * 10 * np.pi
            y_val = int(300 + 50 * np.sin(t) + 30 * np.sin(3 * t))
            cv2.line(img, (i, y_val), (i + 2, y_val), (0, 0, 0), 2)
        _, buf = cv2.imencode(".png", img)
        image_bytes = buf.tobytes()

        ctx = {
            "age": 70, "sex": "Male",
            "height_cm": 170.0, "weight_kg": 80.0, "bmi": 27.7,
            "bp_systolic": 180, "bp_diastolic": 110,
            "heart_rate": 110, "spo2": 94,
            "diabetes_status": "Type 2 Diabetes",
            "diabetic_complications": [],
            "symptoms": {"chest_pain": True, "breathlessness": True,
                         "palpitation": False, "syncope": False},
            "medicines": ["Beta Blocker"],
        }

        pipeline = ECGPipeline(provider=MockInferenceProvider())
        result = await pipeline.run(image_bytes=image_bytes, filename="test.png", clinical_context=ctx)

        cr = result.raw_output_json["clinical_report"]
        assert cr["clinical_priority"] == "URGENT"



class TestReadableHelper:
    def test_snake_case(self):
        assert _readable("ST_elevation_MI") == "ST elevation MI"

    def test_hyphen(self):
        assert _readable("Left-Bundle-Branch") == "Left Bundle Branch"

    def test_already_clean(self):
        assert _readable("Normal Sinus Rhythm") == "Normal Sinus Rhythm"
