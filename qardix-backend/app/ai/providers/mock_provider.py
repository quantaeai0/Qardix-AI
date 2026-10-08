"""
Mock Inference Provider

Produces deterministic, clinically realistic AI output without running
any actual model. Used for:
  - Local development when no Colab session is available
  - Automated testing (CI)
  - Demo mode

The mock reads clinical_context (age, symptoms) to produce two distinct
scenarios so that developers can test both urgency paths without a model.

Switch to this provider by setting INFERENCE_BACKEND=mock in .env.
"""

from __future__ import annotations

from app.ai.schema import ModelInput, RawPrediction
from app.ai.providers.base import ModelInferenceProvider


# Canonical WCR-77 class labels used in mock output.
# The real model outputs 77 classes; this mock covers the most important ones.
_NORMAL_LOGITS: dict[str, float] = {
    "Normal_sinus_rhythm":           0.98,
    "Sinus_bradycardia":             0.01,
    "ST_elevation_MI":               0.00,
    "Atrial_fibrillation":           0.00,
    "Left_bundle_branch_block":      0.00,
    "Right_bundle_branch_block":     0.01,
    "First_degree_AV_block":         0.00,
    "ST_depression":                 0.00,
    "T_wave_inversion":              0.01,
    "Left_ventricular_hypertrophy":  0.00,
}

_URGENT_LOGITS: dict[str, float] = {
    "Normal_sinus_rhythm":           0.02,
    "ST_elevation_MI":               0.94,
    "Sinus_tachycardia":             0.87,
    "ST_depression":                 0.72,
    "T_wave_inversion":              0.68,
    "Left_bundle_branch_block":      0.12,
    "Atrial_fibrillation":           0.08,
    "Right_bundle_branch_block":     0.03,
    "First_degree_AV_block":         0.02,
    "Left_ventricular_hypertrophy":  0.05,
}


class MockInferenceProvider(ModelInferenceProvider):
    """
    Deterministic mock. No model weights, no network calls.
    Scenario selection is based on clinical_context to make testing realistic.
    """

    @property
    def provider_name(self) -> str:
        return "mock"

    async def predict(self, model_input: ModelInput) -> RawPrediction:
        ctx = model_input.clinical_context
        age = ctx.get("age", 50)
        symptoms = ctx.get("symptoms", {})
        has_chest_pain = symptoms.get("chest_pain", False)

        # Urgent scenario: chest pain OR age > 65
        if has_chest_pain or age > 65:
            logits = _URGENT_LOGITS
            top_findings = [
                {"label": "ST_elevation_MI",   "probability": 0.94},
                {"label": "Sinus_tachycardia", "probability": 0.87},
                {"label": "ST_depression",     "probability": 0.72},
                {"label": "T_wave_inversion",  "probability": 0.68},
            ]
        else:
            logits = _NORMAL_LOGITS
            top_findings = [
                {"label": "Normal_sinus_rhythm", "probability": 0.98},
            ]

        return RawPrediction(
            logits=logits,
            top_findings=top_findings,
            model_name="mock_deepecg_wcr77",
            model_version="mock-1.0.0",
            inference_provider=self.provider_name,
            raw_output={
                "scenario": "urgent" if (has_chest_pain or age > 65) else "normal",
                "note": "Mock output — no real model was used.",
            },
        )
