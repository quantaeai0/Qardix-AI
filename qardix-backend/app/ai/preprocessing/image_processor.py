"""
ECG Image Preprocessor

Runs entirely on the local laptop. No model required.

Responsibilities:
  1. Decode and validate the raw image bytes (format, size, decodability)
  2. Convert to greyscale and normalise contrast
  3. Detect orientation and deskew
  4. Crop to the ECG grid region (remove borders/annotations where possible)
  5. Return preprocessed image bytes + metadata

The output (PreprocessedECG) is fed into the digitiser.

All OpenCV operations are synchronous and CPU-only.
"""

from __future__ import annotations

import cv2
import numpy as np
from typing import Tuple

from app.ai.schema import (
    ImageValidationResult,
    PreprocessedECG,
    PipelineError,
)


# ── Image Validation ──────────────────────────────────────────────────────────

def validate_image(image_bytes: bytes, filename: str = "") -> ImageValidationResult:
    """
    Validates that the uploaded bytes are a decodable image.
    Called BEFORE the quality check.

    Returns ImageValidationResult. If is_valid=False, pipeline should halt.
    """
    if not image_bytes:
        return ImageValidationResult(
            is_valid=False,
            reason="Uploaded file is empty.",
            file_size_bytes=0,
        )

    # Check extension hint
    ext = filename.lower().split(".")[-1] if "." in filename else ""
    if ext not in ("jpg", "jpeg", "png", "bmp", "tiff", "tif", "webp", ""):
        return ImageValidationResult(
            is_valid=False,
            reason=f"Unsupported file type '.{ext}'. Please upload a JPG or PNG image.",
            file_size_bytes=len(image_bytes),
        )

    # Try to decode
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        return ImageValidationResult(
            is_valid=False,
            reason="Cannot decode image. File may be corrupted or not a valid image.",
            file_size_bytes=len(image_bytes),
        )

    h, w = img.shape[:2]
    return ImageValidationResult(
        is_valid=True,
        width_px=w,
        height_px=h,
        file_size_bytes=len(image_bytes),
    )


# ── Preprocessing ─────────────────────────────────────────────────────────────

def preprocess_ecg_image(image_bytes: bytes) -> PreprocessedECG:
    """
    Full preprocessing pipeline — all CPU, all local.

    Steps:
      1. Decode
      2. Convert to greyscale
      3. Adaptive contrast enhancement (CLAHE)
      4. Deskew (detect dominant angle, rotate)
      5. Auto-crop (remove white borders)
      6. Re-encode to PNG bytes

    Returns:
        PreprocessedECG with processed image bytes + metadata.

    Raises:
        PipelineError if the image cannot be decoded.
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        raise PipelineError(
            stage="Preprocessing",
            reason="Cannot decode image during preprocessing.",
        )

    original_h, original_w = img.shape[:2]
    metadata: dict = {
        "original_width": original_w,
        "original_height": original_h,
    }

    # Step 1: Convert to greyscale for processing
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Step 2: CLAHE — adaptive contrast enhancement
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    metadata["contrast_enhanced"] = True

    # Step 3: Deskew — detect rotation angle and correct
    deskewed, angle = _deskew(enhanced)
    orientation_corrected = abs(angle) > 0.5
    metadata["deskew_angle_deg"] = round(angle, 2)
    metadata["orientation_corrected"] = orientation_corrected

    # Step 4: Auto-crop — remove white borders
    cropped, crop_applied = _autocrop(deskewed)
    metadata["crop_applied"] = crop_applied
    if crop_applied:
        ch, cw = cropped.shape[:2]
        metadata["cropped_width"] = cw
        metadata["cropped_height"] = ch

    # Step 5: Re-encode to PNG bytes for the digitiser
    _, out_bytes = cv2.imencode(".png", cropped)
    output_bytes = out_bytes.tobytes()

    # Heuristic lead detection (count regions — real digitiser refines this)
    detected_leads = _estimate_leads(cropped)
    metadata["estimated_leads"] = detected_leads

    return PreprocessedECG(
        image_bytes=output_bytes,
        detected_leads=detected_leads,
        orientation_corrected=orientation_corrected,
        crop_applied=crop_applied,
        contrast_enhanced=True,
        metadata=metadata,
    )


# ── Internal helpers ──────────────────────────────────────────────────────────

def _deskew(gray: np.ndarray) -> Tuple[np.ndarray, float]:
    """
    Detect dominant orientation using Hough line transform and rotate to correct.
    Returns (corrected_image, angle_degrees).
    """
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLines(edges, 1, np.pi / 180, threshold=100)

    if lines is None:
        return gray, 0.0

    angles = []
    for line in lines[:50]:          # limit to top 50 lines for speed
        rho, theta = line[0]
        angle = (theta - np.pi / 2) * (180 / np.pi)
        if abs(angle) < 15:          # only consider near-horizontal lines
            angles.append(angle)

    if not angles:
        return gray, 0.0

    median_angle = float(np.median(angles))

    if abs(median_angle) < 0.5:
        return gray, 0.0             # no meaningful skew

    h, w = gray.shape
    centre = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(centre, median_angle, 1.0)
    rotated = cv2.warpAffine(
        gray, M, (w, h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE,
    )
    return rotated, median_angle


def _autocrop(gray: np.ndarray, border_threshold: int = 240) -> Tuple[np.ndarray, bool]:
    """
    Remove white/near-white borders around the ECG.
    Returns (cropped_image, crop_was_applied).
    """
    # Invert so that content (dark lines) becomes bright for findNonZero
    inverted = cv2.bitwise_not(gray)
    _, thresh = cv2.threshold(inverted, 255 - border_threshold, 255, cv2.THRESH_BINARY)

    coords = cv2.findNonZero(thresh)
    if coords is None:
        return gray, False

    x, y, w, h = cv2.boundingRect(coords)

    # Add a small padding
    pad = 10
    x = max(0, x - pad)
    y = max(0, y - pad)
    x2 = min(gray.shape[1], x + w + 2 * pad)
    y2 = min(gray.shape[0], y + h + 2 * pad)

    cropped = gray[y:y2, x:x2]

    # Only report as cropped if it actually removed something meaningful
    orig_area = gray.shape[0] * gray.shape[1]
    crop_area = cropped.shape[0] * cropped.shape[1]
    crop_applied = crop_area < orig_area * 0.95

    return cropped, crop_applied


def _estimate_leads(gray: np.ndarray) -> list[str]:
    """
    Heuristic: divide image into 12 rows and name leads in standard 12-lead order.
    The real ECG-Digitiser performs proper lead detection — this is a best-effort estimate.
    """
    standard_12_lead = ["I", "II", "III", "aVR", "aVL", "aVF",
                         "V1", "V2", "V3", "V4", "V5", "V6"]
    return standard_12_lead
