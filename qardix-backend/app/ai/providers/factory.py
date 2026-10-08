"""
Provider Factory

Single place that reads INFERENCE_BACKEND from settings and returns the
correct ModelInferenceProvider instance.

Changing the inference backend = change one .env variable, restart server.
Zero pipeline code changes required.

Supported values:
    mock   → MockInferenceProvider    (default, local dev)
    colab  → ColabInferenceProvider   (Colab + ngrok)
    local  → LocalInferenceProvider   (future GPU, stub)
"""

from __future__ import annotations

from app.ai.providers.base import ModelInferenceProvider
from app.ai.providers.mock_provider import MockInferenceProvider
from app.ai.providers.colab_provider import ColabInferenceProvider
from app.ai.providers.local_provider import LocalInferenceProvider
from app.config import settings


def get_inference_provider() -> ModelInferenceProvider:
    """
    Returns the configured inference provider.
    Called once per request by the ECG pipeline orchestrator.
    """
    backend = (settings.INFERENCE_BACKEND or "mock").strip().lower()

    if backend == "mock":
        return MockInferenceProvider()
    elif backend == "colab":
        return ColabInferenceProvider()
    elif backend == "local":
        return LocalInferenceProvider()
    else:
        # Unknown value — fall back to mock and warn
        import logging
        logging.warning(
            f"Unknown INFERENCE_BACKEND='{backend}'. "
            "Falling back to MockInferenceProvider. "
            "Valid values: mock | colab | local"
        )
        return MockInferenceProvider()
