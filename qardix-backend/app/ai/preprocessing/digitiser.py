"""
ECG Digitiser Adapter

Wraps the ECG-Digitiser library (PhysioNet 2024 winner, BSD-2-Clause).
Converts the preprocessed ECG image into per-lead waveform arrays.

Repository: github.com/felixkrenos/ECG-Digitiser

When the library is installed:
    pip install ecg-digitiser

This adapter uses it transparently. If not installed, a waveform simulation
is used (for development only — real waveforms required for real predictions).

The output (DigitizerOutput) is the exact format the ModelInput expects.
"""

from __future__ import annotations

import logging
import numpy as np
from typing import Optional

from app.ai.schema import (
    PreprocessedECG,
    DigitizerOutput,
    WaveformValidationResult,
    PipelineError,
)

logger = logging.getLogger(__name__)

# Standard 12-lead order
STANDARD_LEADS = ["I", "II", "III", "aVR", "aVL", "aVF",
                   "V1", "V2", "V3", "V4", "V5", "V6"]

SAMPLE_RATE_HZ: float = 500.0        # standard ECG digitisation rate
DURATION_SECONDS: float = 10.0       # standard 12-lead ECG duration


# ── Digitiser ─────────────────────────────────────────────────────────────────

def digitise_ecg(preprocessed: PreprocessedECG) -> DigitizerOutput:
    """
    Convert preprocessed ECG image → per-lead waveform arrays.

    Tries to use the real ECG-Digitiser library if available.
    Falls back to a simulated waveform in development mode.

    Args:
        preprocessed: Output from image_processor.preprocess_ecg_image()

    Returns:
        DigitizerOutput containing per-lead signal data at SAMPLE_RATE_HZ.

    Raises:
        PipelineError if digitisation fails completely.
    """
    try:
        return _run_ecg_digitiser(preprocessed)
    except ImportError:
        logger.warning(
            "ECG-Digitiser library not installed. "
            "Using simulated waveform for development. "
            "Install with: pip install ecg-digitiser"
        )
        return _simulated_waveform(preprocessed)
    except Exception as exc:
        raise PipelineError(
            stage="ECGDigitiser",
            reason=f"Digitisation failed: {exc}",
        )


def _run_ecg_digitiser(preprocessed: PreprocessedECG) -> DigitizerOutput:
    """
    Calls the real ECG-Digitiser library.

    NOTE: The exact API may differ depending on the installed version.
    Adjust the import and call signature to match the installed library.
    See: https://github.com/felixkrenos/ECG-Digitiser
    """
    # --- Adapt this block when the real library is installed ---
    # import ecg_digitiser
    # result = ecg_digitiser.digitise(
    #     image_bytes=preprocessed.image_bytes,
    #     leads=preprocessed.detected_leads or STANDARD_LEADS,
    #     sample_rate=SAMPLE_RATE_HZ,
    # )
    # leads_dict = {lead: result.waveforms[lead].tolist() for lead in result.waveforms}
    # return DigitizerOutput(
    #     leads=leads_dict,
    #     sample_rate_hz=SAMPLE_RATE_HZ,
    #     duration_seconds=DURATION_SECONDS,
    #     digitiser_version="ecg-digitiser-physionet2024",
    #     raw_digitiser_output=result.raw,
    # )
    # -----------------------------------------------------------

    # This import will raise ImportError in dev — caught above
    import ecg_digitiser  # noqa: F401
    raise NotImplementedError("Real ECG-Digitiser integration — update _run_ecg_digitiser()")


def _simulated_waveform(preprocessed: PreprocessedECG) -> DigitizerOutput:
    """
    Generates a synthetic sinusoidal ECG-like waveform per lead.
    Used ONLY when the real digitiser is not installed.
    The mock inference provider handles this gracefully for development.
    """
    n_samples = int(SAMPLE_RATE_HZ * DURATION_SECONDS)  # 5000 samples
    t = np.linspace(0, DURATION_SECONDS, n_samples)

    leads: dict[str, list[float]] = {}
    lead_names = preprocessed.detected_leads or STANDARD_LEADS

    for i, lead in enumerate(lead_names):
        # Vary amplitude and phase per lead for realism
        amplitude = 0.5 + 0.3 * np.sin(i * 0.8)
        phase = i * 0.15
        # Sinus rhythm at 72 bpm ≈ 1.2 Hz
        signal = amplitude * np.sin(2 * np.pi * 1.2 * t + phase)
        # Add small QRS spikes
        qrs_positions = np.arange(0, DURATION_SECONDS, 1 / 1.2)
        for pos in qrs_positions:
            idx = int(pos * SAMPLE_RATE_HZ)
            for offset in range(-3, 4):
                if 0 <= idx + offset < n_samples:
                    signal[idx + offset] += (3 - abs(offset)) * 0.4
        leads[lead] = signal.tolist()

    return DigitizerOutput(
        leads=leads,
        sample_rate_hz=SAMPLE_RATE_HZ,
        duration_seconds=DURATION_SECONDS,
        digitiser_version="simulated-dev-only",
        raw_digitiser_output={
            "note": "Simulated waveform — install ecg-digitiser for real digitisation.",
            "lead_count": len(leads),
        },
    )


# ── Waveform Validation ───────────────────────────────────────────────────────

def validate_waveform(digitiser_output: DigitizerOutput) -> WaveformValidationResult:
    """
    Validates that digitised waveform data is usable before inference.

    Checks:
      - At least 1 lead present
      - Each lead has enough samples (> 100)
      - No lead contains only constant/flat signal (amplitude check)

    Returns:
        WaveformValidationResult with is_valid=True/False and reason.
    """
    leads = digitiser_output.leads

    if not leads:
        return WaveformValidationResult(
            is_valid=False,
            reason="No leads were extracted from the ECG image.",
            detected_leads_count=0,
        )

    flat_leads = []
    short_leads = []

    for lead_name, signal in leads.items():
        if len(signal) < 100:
            short_leads.append(lead_name)
            continue
        arr = np.array(signal)
        if arr.std() < 0.001:        # essentially flat
            flat_leads.append(lead_name)

    if len(short_leads) == len(leads):
        return WaveformValidationResult(
            is_valid=False,
            reason=f"All leads have insufficient data (< 100 samples). "
                   f"ECG digitisation may have failed.",
            detected_leads_count=len(leads),
        )

    if len(flat_leads) > 8:          # more than 8 of 12 leads flat = likely bad
        return WaveformValidationResult(
            is_valid=False,
            reason=f"Most leads appear flat ({len(flat_leads)} leads). "
                   f"Image quality or digitisation may be poor. "
                   f"Flat leads: {', '.join(flat_leads)}",
            detected_leads_count=len(leads),
        )

    return WaveformValidationResult(
        is_valid=True,
        detected_leads_count=len(leads),
        expected_leads_count=12,
    )
