"""
ECG AI Pipeline — Shared Data Contracts

All data that flows through the pipeline is typed using these dataclasses.
This ensures that every stage (preprocessing, inference, postprocessing)
speaks the same language and can be swapped independently.

Clinical safety note:
  - AI outputs are always labelled as AI-assisted.
  - Urgency is decision-support; final interpretation belongs to the doctor.
  - These structures deliberately do NOT contain medication recommendations
    or autonomous treatment decisions.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from enum import Enum


# ── Enums ─────────────────────────────────────────────────────────────────────

class UrgencyLevel(str, Enum):
    """Urgency flag values used throughout the pipeline and stored in DB."""
    ROUTINE      = "routine"
    REVIEW_SOON  = "review_soon"
    URGENT       = "urgent"


class QualityStatus(str, Enum):
    """Result of the image quality gate."""
    ACCEPTED       = "accepted"
    NEEDS_REUPLOAD = "needs_reupload"


# ── Stage 1: Image Validation & Quality ──────────────────────────────────────

@dataclass
class ImageValidationResult:
    """
    Output of the image-validation step (file format, size, decodability).
    Produced before the quality check.
    """
    is_valid: bool
    reason: Optional[str] = None           # human-readable failure reason
    width_px: Optional[int] = None
    height_px: Optional[int] = None
    file_size_bytes: Optional[int] = None


@dataclass
class QualityCheckResult:
    """
    Output of the OpenCV-based ECG quality gate.
    If status == NEEDS_REUPLOAD the pipeline halts and returns this to the caller.
    """
    status: QualityStatus
    reason: Optional[str] = None           # e.g. "Image is blurry"
    blur_score: Optional[float] = None     # Laplacian variance — higher = sharper
    width_px: Optional[int] = None
    height_px: Optional[int] = None


# ── Stage 2: Preprocessing ────────────────────────────────────────────────────

@dataclass
class PreprocessedECG:
    """
    Result of image preprocessing (deskew, crop, normalise, detect leads).
    This is everything the digitiser needs — no raw bytes passed beyond here.
    """
    image_bytes: bytes                      # preprocessed image (PNG bytes)
    detected_leads: List[str] = field(default_factory=list)   # e.g. ["I","II","V1"...]
    orientation_corrected: bool = False
    crop_applied: bool = False
    contrast_enhanced: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)    # extra debug info


# ── Stage 3: Digitisation ─────────────────────────────────────────────────────

@dataclass
class DigitizerOutput:
    """
    Output of the ECG-Digitiser stage.
    Contains raw waveform data per lead, ready for model input preparation.
    """
    leads: Dict[str, List[float]]           # lead_name → signal samples
    sample_rate_hz: float = 500.0
    duration_seconds: float = 10.0
    digitiser_version: str = "ecg-digitiser-v1"
    raw_digitiser_output: Dict[str, Any] = field(default_factory=dict)


@dataclass
class WaveformValidationResult:
    """
    Result of validating the digitised waveform before inference.
    Catches cases where digitisation returned garbage.
    """
    is_valid: bool
    reason: Optional[str] = None
    detected_leads_count: int = 0
    expected_leads_count: int = 12


# ── Stage 4: Model Input ──────────────────────────────────────────────────────

@dataclass
class ModelInput:
    """
    The exact payload sent to the inference provider.
    Prepared from DigitizerOutput + clinical context.

    LAPTOP BOUNDARY: everything above this is local.
    COLAB BOUNDARY:  this dataclass is serialised and sent over HTTP.
    """
    waveform_data: Dict[str, List[float]]   # per-lead signal data
    sample_rate_hz: float
    clinical_context: Dict[str, Any]        # age, sex, vitals, symptoms, medicines
    model_adapter: str = "deepecg_wcr77"    # which model to use on the Colab side
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Serialise for HTTP transport to Colab."""
        return {
            "waveform_data": self.waveform_data,
            "sample_rate_hz": self.sample_rate_hz,
            "clinical_context": self.clinical_context,
            "model_adapter": self.model_adapter,
            "metadata": self.metadata,
        }


# ── Stage 5: Raw Model Prediction ────────────────────────────────────────────

@dataclass
class RawPrediction:
    """
    Raw output from the model (before postprocessing).
    Preserved in DB as raw_output_json for future audit / model improvement.

    This is the ONLY thing Colab returns.
    """
    logits: Dict[str, float]                # class_label → probability (0-1)
    top_findings: List[Dict[str, Any]]      # [{label, probability}]
    model_name: str = "deepecg_wcr77"
    model_version: str = "1.0.0"
    inference_provider: str = "mock"        # mock | colab | local
    raw_output: Dict[str, Any] = field(default_factory=dict)


# ── Stage 6: Normalised Prediction ───────────────────────────────────────────

@dataclass
class Finding:
    """A single ECG clinical finding."""
    label: str
    detail: str
    probability: float = 0.0
    affected_leads: List[str] = field(default_factory=list)


@dataclass
class NormalisedPrediction:
    """
    Prediction after normalisation (thresholding, label mapping, lead annotation).
    Feeds into urgency and explanation stages.
    """
    findings: List[Finding]
    abnormal_leads: List[str]
    overall_confidence: float
    model_name: str
    model_version: str
    inference_provider: str


# ── Stage 7: Post-processing Output ──────────────────────────────────────────

@dataclass
class UrgencyResult:
    """Output of the deterministic urgency classification rule engine."""
    level: UrgencyLevel
    triggered_rules: List[str]              # which rules fired — for auditability


@dataclass
class PatientExplanation:
    """
    Patient-friendly, non-technical explanation.
    Generated from curated templates (V1) or local LLM (future).
    NOT a diagnosis. NOT a treatment recommendation.
    """
    text: str
    warning_signs: List[str]
    source: str = "template"                # template | llm


# ── Final Result ──────────────────────────────────────────────────────────────

@dataclass
class ECGAIResult:
    """
    The fully assembled AI result returned by the pipeline orchestrator.
    This maps 1:1 to the AiResult DB model and the JSON returned to the frontend.

    Clinical safety statement preserved inline:
    "AI-assisted ECG interpretation. Final clinical interpretation and
     decision remain with the treating doctor."
    """
    # Doctor-facing outputs
    ai_summary: str
    findings: List[Finding]
    confidence_json: Dict[str, float]
    abnormal_leads: List[str]
    urgency: UrgencyLevel

    # Patient-facing outputs
    patient_explanation: str
    warning_signs: List[str]

    # Image quality gate result
    quality_status: QualityStatus
    quality_reason: Optional[str]

    # Preserved for audit and future model improvement
    raw_output_json: Dict[str, Any]

    # Inference metadata
    model_version: str
    inference_provider: str

    # Clinical safety label — always present
    clinical_disclaimer: str = (
        "AI-assisted ECG interpretation. "
        "Final clinical interpretation and decision remain with the treating doctor."
    )


# ── Pipeline Error ─────────────────────────────────────────────────────────────

class PipelineError(Exception):
    """Raised when any pipeline stage fails unrecoverably."""
    def __init__(self, stage: str, reason: str):
        self.stage = stage
        self.reason = reason
        super().__init__(f"[Pipeline:{stage}] {reason}")
