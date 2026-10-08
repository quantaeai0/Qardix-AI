"""
Model Input Preparation

Takes validated waveform data and assembles the exact ModelInput
that will be serialised and sent to the inference provider.

This is the last laptop-side stage before the MODEL INFERENCE BOUNDARY.

Responsibilities:
  - Per-lead signal normalisation (z-score normalisation)
  - Resampling to target sample rate if needed (future)
  - Attaching clinical context for context-aware models
  - Assembling the ModelInput dataclass

After this function, the next call is:
    provider.predict(model_input)
"""

from __future__ import annotations

import numpy as np
from typing import Any, Dict

from app.ai.schema import DigitizerOutput, ModelInput


TARGET_SAMPLE_RATE_HZ: float = 500.0
TARGET_DURATION_SECONDS: float = 10.0
TARGET_N_SAMPLES: int = int(TARGET_SAMPLE_RATE_HZ * TARGET_DURATION_SECONDS)  # 5000


def prepare_model_input(
    digitiser_output: DigitizerOutput,
    clinical_context: Dict[str, Any],
    model_adapter: str = "deepecg_wcr77",
) -> ModelInput:
    """
    Normalises waveform data and assembles the model input payload.

    Args:
        digitiser_output: Output from digitiser.digitise_ecg()
        clinical_context: Dict with age, sex, vitals, symptoms, medicines
        model_adapter: Which model the Colab side should use

    Returns:
        ModelInput ready to be sent to the inference provider.
    """
    normalised_leads: Dict[str, list[float]] = {}

    for lead_name, signal in digitiser_output.leads.items():
        arr = np.array(signal, dtype=np.float64)

        # Resample to target length if needed
        if len(arr) != TARGET_N_SAMPLES:
            arr = _resample(arr, TARGET_N_SAMPLES)

        # Z-score normalisation per lead
        arr = _zscore_normalise(arr)

        normalised_leads[lead_name] = arr.tolist()

    return ModelInput(
        waveform_data=normalised_leads,
        sample_rate_hz=TARGET_SAMPLE_RATE_HZ,
        clinical_context=_sanitise_clinical_context(clinical_context),
        model_adapter=model_adapter,
        metadata={
            "lead_count": len(normalised_leads),
            "samples_per_lead": TARGET_N_SAMPLES,
            "digitiser_version": digitiser_output.digitiser_version,
        },
    )


# ── Internal helpers ──────────────────────────────────────────────────────────

def _zscore_normalise(signal: np.ndarray) -> np.ndarray:
    """Z-score normalisation. Returns signal unchanged if std ≈ 0."""
    mean = signal.mean()
    std = signal.std()
    if std < 1e-8:
        return signal - mean          # flat signal — centre at zero
    return (signal - mean) / std


def _resample(signal: np.ndarray, target_length: int) -> np.ndarray:
    """
    Simple linear interpolation resampling.
    For production, consider scipy.signal.resample for anti-aliasing.
    """
    src_indices = np.linspace(0, len(signal) - 1, target_length)
    return np.interp(src_indices, np.arange(len(signal)), signal)


def _sanitise_clinical_context(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """
    Removes any fields that must not be sent to the model side
    (privacy-by-design: no patient identifiers).
    Only structured clinical parameters are passed.
    """
    allowed_keys = {
        "age", "sex", "height_cm", "weight_kg", "bmi",
        "bp_systolic", "bp_diastolic", "heart_rate", "spo2",
        "diabetes_status", "diabetic_complications",
        "symptoms", "medicines",
    }
    return {k: v for k, v in ctx.items() if k in allowed_keys}
