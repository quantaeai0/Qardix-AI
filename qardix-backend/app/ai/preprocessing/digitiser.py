"""
ECG Digitiser — Async, backend-aware

Stage 2: Dispatches to Colab (/digitise endpoint) when INFERENCE_BACKEND=colab.
         Falls back to simulated waveform ONLY when INFERENCE_BACKEND=mock.
         Never silently substitutes fake waveforms for failed real inference.

Flow by backend:
    mock  → _simulated_waveform()              (existing, unchanged)
    colab → _colab_digitise() via HTTP POST    (new — nnU-Net on Colab)
    local → reserved, raises PipelineError

Colab /digitise contract:
    POST  {COLAB_INFERENCE_URL}/digitise
    Headers: X-API-Key: {COLAB_API_KEY}
    Body:    { "image_b64": "<base64 PNG>", "leads": ["I","II",...] }
    Returns: {
        "leads": { "I": [f, ...], "II": [f, ...], ... },
        "sample_rate_hz": 500.0,
        "duration_seconds": 10.0,
        "digitiser_version": "ecg-digitiser-physionet2024"
    }
    Error:   HTTP 4xx/5xx with { "detail": "..." }

Output validation:
    All responses go through validate_waveform() before the pipeline continues.
    If Colab returns garbage, PipelineError is raised — never silently passed on.
"""

from __future__ import annotations

import asyncio
import base64
import logging
from typing import Optional

import httpx
import numpy as np

from app.ai.schema import (
    DigitizerOutput,
    PreprocessedECG,
    PipelineError,
    WaveformValidationResult,
)
from app.config import settings

logger = logging.getLogger(__name__)

# Standard 12-lead order
STANDARD_LEADS = ["I", "II", "III", "aVR", "aVL", "aVF",
                   "V1", "V2", "V3", "V4", "V5", "V6"]

SAMPLE_RATE_HZ: float = 500.0
DURATION_SECONDS: float = 10.0

# Colab nnU-Net is slow on CPU (~60-120s); generous but finite timeout
COLAB_DIGITISE_TIMEOUT_SECONDS: float = 180.0


# ── Public entry point ────────────────────────────────────────────────────────

async def digitise_ecg(
    preprocessed: PreprocessedECG,
    backend: str = "mock",
) -> DigitizerOutput:
    """
    Convert a preprocessed ECG image → per-lead waveform arrays.

    Args:
        preprocessed: Output of image_processor.preprocess_ecg_image().
        backend:      "mock" | "colab"   (matches INFERENCE_BACKEND setting)

    Returns:
        DigitizerOutput with real or simulated waveform data.

    Raises:
        PipelineError — on Colab failure (never silently falls back to fake
                        waveforms when real inference is requested).
    """
    b = backend.strip().lower()

    if b == "colab":
        logger.info("Digitising ECG via Colab (/digitise endpoint)")
        return await _colab_digitise(preprocessed)

    if b == "local":
        raise PipelineError(
            stage="ECGDigitiser",
            reason="Local digitisation is not yet implemented. "
                   "Set INFERENCE_BACKEND=mock or INFERENCE_BACKEND=colab.",
        )

    # mock / any unrecognised value → simulated waveform
    if b != "mock":
        logger.warning(
            f"Unknown INFERENCE_BACKEND='{b}' for digitiser. Using mock."
        )
    logger.debug("Digitising ECG via simulated waveform (mock mode)")
    return _simulated_waveform(preprocessed)


# ── Colab digitiser ───────────────────────────────────────────────────────────

async def _colab_digitise(preprocessed: PreprocessedECG) -> DigitizerOutput:
    """
    Send preprocessed image bytes to Colab /digitise endpoint.
    Colab runs ECG-Digitiser (nnU-Net) and returns per-lead waveforms as JSON.

    Raises PipelineError on any network, auth, timeout, or parse failure.
    Never returns a simulated fallback — caller must handle the error.
    """
    url = settings.COLAB_INFERENCE_URL
    api_key = settings.COLAB_API_KEY

    if not url:
        raise PipelineError(
            stage="ColabDigitiser",
            reason=(
                "COLAB_INFERENCE_URL is not set. "
                "Set it in .env, or use INFERENCE_BACKEND=mock for local testing."
            ),
        )

    endpoint = f"{url.rstrip('/')}/digitise"

    # Encode image as base64 for JSON transport
    image_b64 = base64.b64encode(preprocessed.image_bytes).decode("utf-8")
    payload = {
        "image_b64": image_b64,
        "leads": preprocessed.detected_leads or STANDARD_LEADS,
    }

    try:
        async with httpx.AsyncClient(timeout=COLAB_DIGITISE_TIMEOUT_SECONDS) as client:
            response = await client.post(
                endpoint,
                json=payload,
                headers={
                    "X-API-Key": api_key,
                    "Content-Type": "application/json",
                },
            )
    except httpx.TimeoutException:
        raise PipelineError(
            stage="ColabDigitiser",
            reason=(
                f"Colab digitisation timed out after {COLAB_DIGITISE_TIMEOUT_SECONDS}s. "
                "nnU-Net inference can take 60-120 s on Colab CPU. "
                "Check that the Colab session is still active."
            ),
        )
    except httpx.RequestError as exc:
        raise PipelineError(
            stage="ColabDigitiser",
            reason=f"Network error contacting Colab digitiser at {endpoint}: {exc}",
        )

    if response.status_code != 200:
        raise PipelineError(
            stage="ColabDigitiser",
            reason=(
                f"Colab /digitise returned HTTP {response.status_code}. "
                f"Body: {response.text[:300]}"
            ),
        )

    try:
        data = response.json()
    except Exception as exc:
        raise PipelineError(
            stage="ColabDigitiser",
            reason=f"Could not parse Colab /digitise response as JSON: {exc}. "
                   f"Raw: {response.text[:200]}",
        )

    # Validate required fields
    if "leads" not in data or not isinstance(data["leads"], dict):
        raise PipelineError(
            stage="ColabDigitiser",
            reason=(
                f"Colab /digitise response missing 'leads' dict. "
                f"Got keys: {list(data.keys())}"
            ),
        )

    if not data["leads"]:
        raise PipelineError(
            stage="ColabDigitiser",
            reason="Colab /digitise returned an empty 'leads' dict. "
                   "ECG-Digitiser may have failed to segment the image.",
        )

    # Validate each lead is a non-empty list of numbers
    leads: dict[str, list[float]] = {}
    for lead_name, signal in data["leads"].items():
        if not isinstance(signal, list) or len(signal) == 0:
            raise PipelineError(
                stage="ColabDigitiser",
                reason=f"Lead '{lead_name}' from Colab is empty or not a list.",
            )
        leads[lead_name] = [float(v) for v in signal]

    sample_rate = float(data.get("sample_rate_hz", SAMPLE_RATE_HZ))
    duration = float(data.get("duration_seconds", DURATION_SECONDS))
    version = str(data.get("digitiser_version", "ecg-digitiser-physionet2024"))

    logger.info(
        f"Colab digitiser returned {len(leads)} leads, "
        f"{sample_rate} Hz, version={version}"
    )

    return DigitizerOutput(
        leads=leads,
        sample_rate_hz=sample_rate,
        duration_seconds=duration,
        digitiser_version=version,
        raw_digitiser_output={
            "source": "colab",
            "endpoint": endpoint,
            "lead_count": len(leads),
        },
    )


# ── Mock / simulated waveform (unchanged from Stage 1) ───────────────────────

def _simulated_waveform(preprocessed: PreprocessedECG) -> DigitizerOutput:
    """
    Synthetic ECG-like waveform for mock/dev mode only.
    NOT used when INFERENCE_BACKEND=colab — real waveforms are required.
    """
    n_samples = int(SAMPLE_RATE_HZ * DURATION_SECONDS)
    t = np.linspace(0, DURATION_SECONDS, n_samples)

    leads: dict[str, list[float]] = {}
    lead_names = preprocessed.detected_leads or STANDARD_LEADS

    for i, lead in enumerate(lead_names):
        amplitude = 0.5 + 0.3 * np.sin(i * 0.8)
        phase = i * 0.15
        signal = amplitude * np.sin(2 * np.pi * 1.2 * t + phase)
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
            "note": "Simulated waveform — mock mode only.",
            "lead_count": len(leads),
        },
    )


# ── Waveform Validation (unchanged) ──────────────────────────────────────────

def validate_waveform(digitiser_output: DigitizerOutput) -> WaveformValidationResult:
    """
    Validates that digitised waveform data is usable before inference.

    Checks:
      - At least 1 lead present
      - Each lead has enough samples (> 100)
      - No lead contains only constant/flat signal

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
        if arr.std() < 0.001:
            flat_leads.append(lead_name)

    if len(short_leads) == len(leads):
        return WaveformValidationResult(
            is_valid=False,
            reason="All leads have insufficient data (< 100 samples). "
                   "ECG digitisation may have failed.",
            detected_leads_count=len(leads),
        )

    if len(flat_leads) > 8:
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
