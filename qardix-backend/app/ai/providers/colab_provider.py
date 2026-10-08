"""
Colab Inference Provider

Sends the prepared ModelInput to a FastAPI endpoint running inside a
Google Colab notebook exposed via ngrok.

LAPTOP RESPONSIBILITY: Everything before this call.
COLAB RESPONSIBILITY:  Receive ModelInput JSON → run DeepECG model → return RawPrediction JSON.

The Colab notebook must expose:
    POST /predict
    Headers: X-API-Key: <COLAB_API_KEY>
    Body: ModelInput.to_dict()
    Response: RawPrediction as JSON

On any network/timeout failure, raises PipelineError so the orchestrator
can decide to fall back to MockInferenceProvider if configured.

Configure via .env:
    INFERENCE_BACKEND=colab
    COLAB_INFERENCE_URL=https://your-ngrok-id.ngrok-free.app
    COLAB_API_KEY=your-shared-secret
"""

from __future__ import annotations

import httpx
from app.ai.schema import ModelInput, RawPrediction, PipelineError
from app.ai.providers.base import ModelInferenceProvider
from app.config import settings


class ColabInferenceProvider(ModelInferenceProvider):
    """
    Sends waveform data to Google Colab via ngrok HTTP endpoint.
    The Colab side runs the actual DeepECG / EfficientNetV2-77 model.

    No preprocessing, quality checks, or postprocessing happen in Colab —
    those stages all run locally (see ECGPipeline).
    """

    TIMEOUT_SECONDS: float = 90.0   # model inference can take ~30-60s on Colab CPU

    @property
    def provider_name(self) -> str:
        return "colab"

    async def predict(self, model_input: ModelInput) -> RawPrediction:
        url = settings.COLAB_INFERENCE_URL
        api_key = settings.COLAB_API_KEY

        if not url:
            raise PipelineError(
                stage="ColabInferenceProvider",
                reason="COLAB_INFERENCE_URL is not configured. "
                       "Set it in .env or switch INFERENCE_BACKEND=mock for local testing.",
            )

        endpoint = f"{url.rstrip('/')}/predict"

        try:
            async with httpx.AsyncClient(timeout=self.TIMEOUT_SECONDS) as client:
                response = await client.post(
                    endpoint,
                    json=model_input.to_dict(),
                    headers={
                        "X-API-Key": api_key,
                        "Content-Type": "application/json",
                    },
                )
        except httpx.TimeoutException:
            raise PipelineError(
                stage="ColabInferenceProvider",
                reason=f"Colab inference timed out after {self.TIMEOUT_SECONDS}s. "
                       "The Colab session may have disconnected.",
            )
        except httpx.RequestError as exc:
            raise PipelineError(
                stage="ColabInferenceProvider",
                reason=f"Network error contacting Colab at {endpoint}: {exc}",
            )

        if response.status_code != 200:
            raise PipelineError(
                stage="ColabInferenceProvider",
                reason=f"Colab returned HTTP {response.status_code}: {response.text[:200]}",
            )

        try:
            data = response.json()
        except Exception as exc:
            raise PipelineError(
                stage="ColabInferenceProvider",
                reason=f"Could not parse Colab response as JSON: {exc}",
            )

        # Parse and return the RawPrediction from Colab response
        return RawPrediction(
            logits=data.get("logits", {}),
            top_findings=data.get("top_findings", []),
            model_name=data.get("model_name", "deepecg_wcr77"),
            model_version=data.get("model_version", "unknown"),
            inference_provider=self.provider_name,
            raw_output=data,
        )
