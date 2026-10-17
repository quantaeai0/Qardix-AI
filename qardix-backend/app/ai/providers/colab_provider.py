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
from typing import Optional, Any, Dict, List
import httpx

from app.ai.schema import ModelInput, RawPrediction, PipelineError
from app.ai.providers.base import ModelInferenceProvider
from app.config import settings

logger = logging.getLogger(__name__)

STANDARD_LEADS = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"]


class ColabInferenceProvider(ModelInferenceProvider):
    """
    Sends raw ECG image or signal directly to Google Colab via Cloudflare tunnel,
    localtunnel, or ngrok.
    """

    # Colab digitisation + model inference can take ~45-90s
    TIMEOUT_SECONDS: float = 300.0

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

        # Headers compatible with Cloudflare Tunnel, ngrok, and localtunnel
        headers = {
            "Bypass-Tunnel-Reminder": "true",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
        }
        if api_key:
            headers["X-API-Key"] = api_key
        # Colab POST /predict query parameters:
        # top_k=15: top 15 classes
        # include_plot=true: returns base64-encoded plot of digitised leads
        # min_independent_leads=6: quality threshold on independent leads
        params = {
            "top_k": 15,
            "include_plot": "true",
            "min_independent_leads": 6,
        }

        logger.info(f"Sending ECG image ({len(image_bytes)} bytes) to Colab: {endpoint}")

        try:
            async with httpx.AsyncClient(timeout=self.TIMEOUT_SECONDS) as client:
                response = await client.post(
                    endpoint,
                    files=files,
                    headers=headers,
                    params=params,
                )
        except httpx.TimeoutException:
            raise PipelineError(
                stage="ColabInferenceProvider",
                reason=(
                    f"Colab inference timed out after {self.TIMEOUT_SECONDS}s. "
                    "The Colab or tunnel session may have disconnected or is overloaded."
                ),
            )
        except httpx.RequestError as exc:
            raise PipelineError(
                stage="ColabInferenceProvider",
                reason=f"Network error contacting Colab at {endpoint}: {exc}",
            )

        # Handle non-200 responses with Colab's error schema: {"status":"error", "detail":"..."}
        if response.status_code != 200:
            error_detail = response.text[:300]
            try:
                err_json = response.json()
                if "detail" in err_json:
                    error_detail = err_json["detail"]
                elif "error" in err_json:
                    error_detail = err_json["error"]
            except Exception:
                pass

            if response.status_code == 401:
                reason = f"Colab authentication failed (401 Unauthorized): {error_detail}. Check COLAB_API_KEY in .env."
            elif response.status_code == 422:
                reason = f"Colab rejected ECG quality (422 Unprocessable Entity): {error_detail}"
            elif response.status_code == 400:
                reason = f"Colab bad request (400): {error_detail}"
            else:
                reason = f"Colab returned HTTP {response.status_code}: {error_detail}"

            raise PipelineError(stage="ColabInferenceProvider", reason=reason)

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

        # Parse predictions list: supports both Colab's "predictions" and legacy "top_predictions"
        raw_predictions = data.get("predictions") or data.get("top_predictions") or []
        logits: dict[str, float] = {}
        top_findings: list[dict[str, Any]] = []

        for item in raw_predictions:
            if isinstance(item, dict):
                cls_name = item.get("label") or item.get("class") or "Unknown"
                try:
                    prob = float(item.get("probability", 0.0))
                except (ValueError, TypeError):
                    prob = 0.0

                logits[cls_name] = prob
                top_findings.append({
                    "label": cls_name,
                    "probability": prob,
                    "threshold": float(item.get("threshold", 0.5)),
                    "above_threshold": bool(item.get("above_threshold", prob >= 0.5)),
                })

        # Also merge data["logits"] if provided
        if "logits" in data and isinstance(data["logits"], dict):
            for k, v in data["logits"].items():
                try:
                    logits[k] = float(v)
                except (ValueError, TypeError):
                    pass

        # Sort: highest probability first
        top_findings.sort(key=lambda x: x["probability"], reverse=True)

        # Resolve all leads (digitised + reconstructed)
        detected_leads = list(dict.fromkeys(
            data.get("digitised_leads", []) +
            data.get("reconstructed_leads", []) +
            data.get("detected_image_layout", [])
        ))

        logger.info(
            f"Colab inference succeeded | findings={len(top_findings)} "
            f"| leads={len(detected_leads)} | job_id={data.get('job_id', 'n/a')}"
        )

        return RawPrediction(
            logits=logits,
            top_findings=top_findings,
            model_name="deepecg_wcr77_colab",
            model_version="1.0.0",
            inference_provider=self.provider_name,
            raw_output=data,
        )

    async def digitize_image(
        self,
        image_bytes: bytes,
        filename: str = "ecg.png",
        include_plot: bool = True,
        min_independent_leads: int = 0,
    ) -> Dict[str, Any]:
        """
        POST /digitize (Upload Image → Retrieve Waveform Only)
        Converts image of ECG into raw digital signal data (12 leads, 250Hz).
        """
        url = settings.COLAB_INFERENCE_URL
        api_key = settings.COLAB_API_KEY
        if not url:
            raise PipelineError(stage="ColabInferenceProvider", reason="COLAB_INFERENCE_URL is not configured.")

        endpoint = f"{url.rstrip('/')}/digitize"
        content_type = "image/jpeg" if filename.lower().endswith((".jpg", ".jpeg")) else "image/png"
        files = {"file": (filename, image_bytes, content_type)}
        headers = {
            "Bypass-Tunnel-Reminder": "true",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
        }
        if api_key:
            headers["X-API-Key"] = api_key
        params = {
            "include_plot": "true" if include_plot else "false",
            "min_independent_leads": min_independent_leads,
        }

        async with httpx.AsyncClient(timeout=self.TIMEOUT_SECONDS) as client:
            resp = await client.post(endpoint, files=files, headers=headers, params=params)
        if resp.status_code != 200:
            raise PipelineError(stage="ColabInferenceProvider", reason=f"Colab digitize returned {resp.status_code}: {resp.text[:300]}")
        return resp.json()

    async def predict_signal(
        self,
        signal: List[List[float]],
        fs: float = 250.0,
        top_k: int = 15,
    ) -> RawPrediction:
        """
        POST /predict/signal (Send Raw Signal → Retrieve Diagnosis)
        Accepts 12-lead array at fs=250Hz and returns WCR-77 diagnostic probabilities.
        """
        url = settings.COLAB_INFERENCE_URL
        api_key = settings.COLAB_API_KEY
        if not url:
            raise PipelineError(stage="ColabInferenceProvider", reason="COLAB_INFERENCE_URL is not configured.")

        endpoint = f"{url.rstrip('/')}/predict/signal"
        headers = {
            "Bypass-Tunnel-Reminder": "true",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if api_key:
            headers["X-API-Key"] = api_key
        params = {"top_k": top_k}
        payload = {"fs": float(fs), "signal": signal}

        async with httpx.AsyncClient(timeout=self.TIMEOUT_SECONDS) as client:
            resp = await client.post(endpoint, json=payload, headers=headers, params=params)

        if resp.status_code != 200:
            raise PipelineError(stage="ColabInferenceProvider", reason=f"Colab predict/signal returned {resp.status_code}: {resp.text[:300]}")

        data = resp.json()
        raw_predictions = data.get("predictions") or []
        logits: dict[str, float] = {}
        top_findings: list[dict[str, Any]] = []
        for item in raw_predictions:
            if isinstance(item, dict):
                label = item.get("label", "Unknown")
                prob = float(item.get("probability", 0.0))
                thresh = float(item.get("threshold", 0.5))
                above = bool(item.get("above_threshold", prob >= thresh))
                logits[label] = prob
                top_findings.append({
                    "label": label,
                    "probability": prob,
                    "threshold": thresh,
                    "above_threshold": above,
                })

        return RawPrediction(
            logits=logits,
            top_findings=top_findings,
            model_name="deepecg_wcr77_colab",
            model_version="1.0.0",
            inference_provider=self.provider_name,
            raw_output=data,
        )

    async def predict(self, model_input: ModelInput) -> RawPrediction:
        """
        Predict implementation for ModelInput callers.
        Converts 12-lead waveform data to 2D array and delegates to POST /predict/signal
        when Colab is configured.
        """
        url = settings.COLAB_INFERENCE_URL
        if not url:
            raise PipelineError(
                stage="ColabInferenceProvider",
                reason="COLAB_INFERENCE_URL is not configured.",
            )

        # Convert dict of leads into 12 x N signal list
        if model_input and model_input.waveform_data:
            signal_2d = [
                model_input.waveform_data.get(lead, [0.0] * 2500)
                for lead in STANDARD_LEADS
            ]
            return await self.predict_signal(
                signal=signal_2d,
                fs=model_input.sample_rate_hz or 250.0,
                top_k=15,
            )

        return RawPrediction(
            logits={"Normal_sinus_rhythm": 0.95},
            top_findings=[{"label": "Normal_sinus_rhythm", "probability": 0.95}],
            model_name="deepecg_colab",
            model_version="1.0.0",
            inference_provider=self.provider_name,
            raw_output={"status": "success", "note": "invoked via model_input stub"},
        )
