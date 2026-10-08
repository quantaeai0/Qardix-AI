"""
Model Inference Provider — Abstract Interface

This is the ONLY point in the pipeline that knows anything about WHERE
the model runs (Colab, local GPU, mock).

Every provider must implement exactly this interface.
The rest of the pipeline is provider-agnostic.

Architecture:

    ECGPipeline
        │
        ▼
    ModelInferenceProvider (abstract)
        │
        ├── MockInferenceProvider    ← local dev / CI testing
        ├── ColabInferenceProvider   ← current production path
        └── LocalInferenceProvider  ← future GPU server (stub only)

To switch the model backend: change which provider is injected.
No other pipeline code changes.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from app.ai.schema import ModelInput, RawPrediction


class ModelInferenceProvider(ABC):
    """
    Abstract base for all inference backends.
    Implement `predict` to add a new provider.
    """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Human-readable name used in RawPrediction.inference_provider."""
        ...

    @abstractmethod
    async def predict(self, model_input: ModelInput) -> RawPrediction:
        """
        Run model inference on prepared waveform data.

        Args:
            model_input: Serialisable input prepared by the laptop pipeline.
                         Includes waveform_data, clinical_context, model_adapter.

        Returns:
            RawPrediction: Raw logits + top findings from the model.
                           Will be normalised and postprocessed by the pipeline.

        Raises:
            PipelineError: If inference fails unrecoverably.
        """
        ...

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} provider={self.provider_name}>"
