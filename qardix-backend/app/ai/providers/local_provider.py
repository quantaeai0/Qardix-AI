"""
Local Inference Provider — Stub

Placeholder for future local / GPU inference.
Kept here so the provider interface is complete and the
switch from Colab → local GPU requires NO pipeline changes.

To implement:
  1. Load DeepECG / EfficientNetV2-77 weights from LOCAL_WCR77_MODEL_PATH
  2. Run torch/ONNX inference on ModelInput.waveform_data
  3. Return RawPrediction

Configure via .env:
    INFERENCE_BACKEND=local
    LOCAL_WCR77_MODEL_PATH=./ai/deep_ecg/weights/
"""

from __future__ import annotations

from app.ai.schema import ModelInput, RawPrediction, PipelineError
from app.ai.providers.base import ModelInferenceProvider


class LocalInferenceProvider(ModelInferenceProvider):
    """
    Future local model inference (PyTorch / ONNX Runtime).
    Currently raises PipelineError — not yet implemented.
    """

    @property
    def provider_name(self) -> str:
        return "local"

    async def predict(self, model_input: ModelInput) -> RawPrediction:
        # TODO: Load model weights and run local inference
        # from app.config import settings
        # model = load_model(settings.LOCAL_WCR77_MODEL_PATH)
        # result = model.predict(model_input.waveform_data)
        raise PipelineError(
            stage="LocalInferenceProvider",
            reason="Local inference is not yet implemented. "
                   "Set INFERENCE_BACKEND=mock or INFERENCE_BACKEND=colab in .env.",
        )
