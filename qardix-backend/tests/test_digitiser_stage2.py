"""
Stage 2 — Digitiser async / Colab path tests

Tests the new async digitise_ecg() with backend dispatch.
No real Colab connection required.

Run with:
    pytest tests/test_digitiser_stage2.py -v
"""

import asyncio
import os
import sys
import pytest
from unittest.mock import patch, AsyncMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx
import numpy as np
import cv2

from app.ai.schema import DigitizerOutput, PipelineError
from app.ai.preprocessing.image_processor import preprocess_ecg_image
from app.ai.preprocessing.digitiser import digitise_ecg


# ── Image fixture ─────────────────────────────────────────────────────────────

def _make_ecg_image(width: int = 800, height: int = 600) -> bytes:
    img = np.ones((height, width, 3), dtype=np.uint8) * 255
    for x in range(0, width, 20):
        cv2.line(img, (x, 0), (x, height), (220, 200, 200), 1)
    for y in range(0, height, 20):
        cv2.line(img, (0, y), (width, y), (220, 200, 200), 1)
    points = []
    for i in range(0, width, 2):
        t = i / width * 10 * np.pi
        y_val = int(height // 2 + 50 * np.sin(t))
        points.append((i, y_val))
    for i in range(len(points) - 1):
        cv2.line(img, points[i], points[i + 1], (0, 0, 0), 2)
    _, buf = cv2.imencode(".png", img)
    return buf.tobytes()


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestDigitiserAsync:

    def test_mock_backend_returns_simulated_waveform(self):
        """mock backend must return DigitizerOutput without any network call."""
        img_bytes = _make_ecg_image()
        preprocessed = preprocess_ecg_image(img_bytes)
        output = asyncio.get_event_loop().run_until_complete(
            digitise_ecg(preprocessed, backend="mock")
        )
        assert isinstance(output, DigitizerOutput)
        assert len(output.leads) == 12
        assert output.digitiser_version == "simulated-dev-only"
        for lead, signal in output.leads.items():
            assert len(signal) > 100, f"Lead {lead} signal too short"

    def test_local_backend_raises_not_implemented(self):
        """local backend must raise PipelineError — reserved for future use."""
        img_bytes = _make_ecg_image()
        preprocessed = preprocess_ecg_image(img_bytes)

        with pytest.raises(PipelineError) as exc_info:
            asyncio.get_event_loop().run_until_complete(
                digitise_ecg(preprocessed, backend="local")
            )
        assert exc_info.value.stage == "ECGDigitiser"

    def test_colab_backend_raises_when_url_not_configured(self):
        """
        Colab backend with empty URL must raise PipelineError immediately.
        Must NOT silently fall back to a simulated waveform.
        """
        img_bytes = _make_ecg_image()
        preprocessed = preprocess_ecg_image(img_bytes)

        # Patch settings inside the digitiser module (where it's imported)
        with patch("app.ai.preprocessing.digitiser.settings") as mock_settings:
            mock_settings.COLAB_INFERENCE_URL = ""
            mock_settings.COLAB_API_KEY = "test-key"

            with pytest.raises(PipelineError) as exc_info:
                asyncio.get_event_loop().run_until_complete(
                    digitise_ecg(preprocessed, backend="colab")
                )

        assert exc_info.value.stage == "ColabDigitiser"
        assert "COLAB_INFERENCE_URL" in exc_info.value.reason

    def test_colab_backend_raises_on_missing_leads_key(self):
        """
        If Colab /digitise returns HTTP 200 but no 'leads' field,
        PipelineError must be raised — never returns garbage data.
        """
        img_bytes = _make_ecg_image()
        preprocessed = preprocess_ecg_image(img_bytes)

        # Build a mock response with wrong shape (missing 'leads')
        mock_response = httpx.Response(200, json={"status": "ok", "data": "wrong shape"})

        with patch("app.ai.preprocessing.digitiser.settings") as mock_settings:
            mock_settings.COLAB_INFERENCE_URL = "https://fake-test.ngrok-free.app"
            mock_settings.COLAB_API_KEY = "test-key"

            with patch("httpx.AsyncClient") as mock_client_cls:
                mock_instance = mock_client_cls.return_value.__aenter__.return_value
                mock_instance.post = AsyncMock(return_value=mock_response)

                with pytest.raises(PipelineError) as exc_info:
                    asyncio.get_event_loop().run_until_complete(
                        digitise_ecg(preprocessed, backend="colab")
                    )

        assert exc_info.value.stage == "ColabDigitiser"
        assert "leads" in exc_info.value.reason.lower()

    def test_colab_backend_raises_on_http_error(self):
        """
        Colab returning HTTP 500 must raise PipelineError with the status code.
        """
        img_bytes = _make_ecg_image()
        preprocessed = preprocess_ecg_image(img_bytes)

        mock_response = httpx.Response(500, text="Internal Server Error")

        with patch("app.ai.preprocessing.digitiser.settings") as mock_settings:
            mock_settings.COLAB_INFERENCE_URL = "https://fake-test.ngrok-free.app"
            mock_settings.COLAB_API_KEY = "test-key"

            with patch("httpx.AsyncClient") as mock_client_cls:
                mock_instance = mock_client_cls.return_value.__aenter__.return_value
                mock_instance.post = AsyncMock(return_value=mock_response)

                with pytest.raises(PipelineError) as exc_info:
                    asyncio.get_event_loop().run_until_complete(
                        digitise_ecg(preprocessed, backend="colab")
                    )

        assert exc_info.value.stage == "ColabDigitiser"
        assert "500" in exc_info.value.reason

    def test_colab_backend_raises_on_empty_leads(self):
        """
        Colab returning 'leads: {}' must raise PipelineError — empty dict is invalid.
        """
        img_bytes = _make_ecg_image()
        preprocessed = preprocess_ecg_image(img_bytes)

        mock_response = httpx.Response(200, json={"leads": {}, "sample_rate_hz": 500.0})

        with patch("app.ai.preprocessing.digitiser.settings") as mock_settings:
            mock_settings.COLAB_INFERENCE_URL = "https://fake-test.ngrok-free.app"
            mock_settings.COLAB_API_KEY = "test-key"

            with patch("httpx.AsyncClient") as mock_client_cls:
                mock_instance = mock_client_cls.return_value.__aenter__.return_value
                mock_instance.post = AsyncMock(return_value=mock_response)

                with pytest.raises(PipelineError) as exc_info:
                    asyncio.get_event_loop().run_until_complete(
                        digitise_ecg(preprocessed, backend="colab")
                    )

        assert exc_info.value.stage == "ColabDigitiser"

    def test_colab_backend_success_returns_digitizer_output(self):
        """
        Valid Colab /digitise response (200 + proper leads dict) must return
        a correctly populated DigitizerOutput.
        """
        img_bytes = _make_ecg_image()
        preprocessed = preprocess_ecg_image(img_bytes)

        # Build a valid mock response with 12 leads
        leads = {
            lead: [float(np.sin(i * 0.01)) for i in range(5000)]
            for lead in ["I","II","III","aVR","aVL","aVF","V1","V2","V3","V4","V5","V6"]
        }
        mock_response = httpx.Response(200, json={
            "leads": leads,
            "sample_rate_hz": 500.0,
            "duration_seconds": 10.0,
            "digitiser_version": "ecg-digitiser-physionet2024",
        })

        with patch("app.ai.preprocessing.digitiser.settings") as mock_settings:
            mock_settings.COLAB_INFERENCE_URL = "https://fake-test.ngrok-free.app"
            mock_settings.COLAB_API_KEY = "test-key"

            with patch("httpx.AsyncClient") as mock_client_cls:
                mock_instance = mock_client_cls.return_value.__aenter__.return_value
                mock_instance.post = AsyncMock(return_value=mock_response)

                output = asyncio.get_event_loop().run_until_complete(
                    digitise_ecg(preprocessed, backend="colab")
                )

        assert isinstance(output, DigitizerOutput)
        assert len(output.leads) == 12
        assert output.sample_rate_hz == 500.0
        assert output.digitiser_version == "ecg-digitiser-physionet2024"
        assert output.raw_digitiser_output["source"] == "colab"
