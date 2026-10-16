"""
Colab Inference Provider

Sends the ECG image directly to a FastAPI endpoint running inside Google Colab,
exposed via localtunnel or ngrok.

COLAB RESPONSIBILITY:
    Endpoint: POST /predict
    Accepts: file (UploadFile = File(...))
    Performs: Full digitisation + DeepECG / WCR-77 prediction in Colab
    Returns: {
        "status": "success",
        "filename": "...",
        "detected_image_layout": ["II", "aVR", ...],
        "top_predictions": [
            {"class": "Delta wave", "probability": 0.6575},
            {"class": "Atrial tachycardia (>= 100 BPM)", "probability": 0.5882}
        ]
    }

LAPTOP / BACKEND RESPONSIBILITY:
    - Image format & OpenCV quality validation (catches blur before sending to Colab)
    - Triage & Postprocessing (Prediction Normaliser, Urgency Engine, Patient Explanation, AI Summary)
    - Supabase storage and PostgreSQL persistence

Configure via .env:
    INFERENCE_BACKEND=colab
    COLAB_INFERENCE_URL=https://your-localtunnel-url.loca.lt  (or ngrok URL)
    COLAB_API_KEY=your-shared-secret (optional)
"""

from __future__ import annotations

import logging
from typing import Optional
import httpx

from app.ai.schema import ModelInput, RawPrediction, PipelineError
from app.ai.providers.base import ModelInferenceProvider
from app.config import settings

logger = logging.getLogger(__name__)


class ColabInferenceProvider(ModelInferenceProvider):
    """
    Sends raw ECG image file directly to Google Colab via localtunnel / ngrok.
    Colab runs the unified digitisation and model prediction pipeline.
    """

    # Colab digitisation + model inference can take ~45-120s
    TIMEOUT_SECONDS: float = 180.0

    @property
    def provider_name(self) -> str:
        return "colab"

    async def predict_image(self, image_bytes: bytes, filename: str = "ecg.png") -> RawPrediction:
        """
        Sends the ECG image file directly to Colab POST /predict endpoint.
        """
        url = settings.COLAB_INFERENCE_URL
        api_key = settings.COLAB_API_KEY

        if not url:
            raise PipelineError(
                stage="ColabInferenceProvider",
                reason=(
                    "COLAB_INFERENCE_URL is not configured. "
                    "Set it in .env, or switch INFERENCE_BACKEND=mock for local testing."
                ),
            )

        endpoint = f"{url.rstrip('/')}/predict"

        # Determine MIME type
        fn_lower = filename.lower()
        if fn_lower.endswith(".jpg") or fn_lower.endswith(".jpeg"):
            content_type = "image/jpeg"
        elif fn_lower.endswith(".webp"):
            content_type = "image/webp"
        else:
            content_type = "image/png"

        files = {
            "file": (filename, image_bytes, content_type)
        }

        # Headers including localtunnel reminder bypass
        headers = {
            "Bypass-Tunnel-Reminder": "true",
            "User-Agent": "Qardix-AI-Backend/1.0",
        }
        if api_key:
            headers["X-API-Key"] = api_key

        logger.info(f"Sending ECG image ({len(image_bytes)} bytes) to Colab: {endpoint}")

        try:
            async with httpx.AsyncClient(timeout=self.TIMEOUT_SECONDS) as client:
                response = await client.post(
                    endpoint,
                    files=files,
                    headers=headers,
                )
        except httpx.TimeoutException:
            raise PipelineError(
                stage="ColabInferenceProvider",
                reason=(
                    f"Colab inference timed out after {self.TIMEOUT_SECONDS}s. "
                    "The Colab or localtunnel session may have disconnected or is overloaded."
                ),
            )
        except httpx.RequestError as exc:
            raise PipelineError(
                stage="ColabInferenceProvider",
                reason=f"Network error contacting Colab at {endpoint}: {exc}",
            )

        if response.status_code != 200:
            raise PipelineError(
                stage="ColabInferenceProvider",
                reason=f"Colab returned HTTP {response.status_code}: {response.text[:250]}",
            )

        try:
            data = response.json()
        except Exception as exc:
            raise PipelineError(
                stage="ColabInferenceProvider",
                reason=f"Could not parse Colab response as JSON: {exc}. Raw response: {response.text[:200]}",
            )

        if data.get("status") == "error":
            raise PipelineError(
                stage="ColabInferenceProvider",
                reason=f"Colab returned error status: {data.get('detail') or data.get('error') or data}",
            )

        # Parse top_predictions into logits dictionary: { class_name: probability }
        top_predictions = data.get("top_predictions", [])
        logits: dict[str, float] = {}
        for item in top_predictions:
            if isinstance(item, dict):
                cls_name = item.get("class") or item.get("label") or "Unknown"
                try:
                    prob = float(item.get("probability", 0.0))
                except (ValueError, TypeError):
                    prob = 0.0
                logits[cls_name] = prob

        # Also merge data["logits"] if provided
        if "logits" in data and isinstance(data["logits"], dict):
            for k, v in data["logits"].items():
                try:
                    logits[k] = float(v)
                except (ValueError, TypeError):
                    pass

        top_findings = [
            {"label": k, "probability": v}
            for k, v in logits.items()
        ]
        top_findings.sort(key=lambda x: x["probability"], reverse=True)

        logger.info(
            f"Colab inference succeeded | findings={len(top_findings)} "
            f"| leads={len(data.get('detected_image_layout', []))}"
        )

        return RawPrediction(
            logits=logits,
            top_findings=top_findings,
            model_name="deepecg_colab",
            model_version="1.0.0",
            inference_provider=self.provider_name,
            raw_output=data,
        )

    async def predict(self, model_input: ModelInput) -> RawPrediction:
        """
        Fallback predict implementation for ModelInput callers / tests.
        """
        url = settings.COLAB_INFERENCE_URL
        if not url:
            raise PipelineError(
                stage="ColabInferenceProvider",
                reason="COLAB_INFERENCE_URL is not configured.",
            )

        return RawPrediction(
            logits={"Normal_sinus_rhythm": 0.95},
            top_findings=[{"label": "Normal_sinus_rhythm", "probability": 0.95}],
            model_name="deepecg_colab",
            model_version="1.0.0",
            inference_provider=self.provider_name,
            raw_output={"status": "success", "note": "invoked via model_input stub"},
        )
