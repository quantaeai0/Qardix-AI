"""
Prediction Normaliser

Converts raw model logits (WCR-77 class probabilities) into structured
Finding objects with human-readable labels, clinical detail, and lead annotations.

All thresholds are deterministic and doctor-reviewable.
No LLM or probabilistic generation happens here.

WCR-77 produces 77 classes; this normaliser maps the most clinically significant
ones to the Finding structure. Unknown classes above the threshold are reported
as generic findings to avoid silently dropping abnormalities.
"""

from __future__ import annotations

from app.ai.schema import RawPrediction, NormalisedPrediction, Finding

# ── Finding configuration ──────────────────────────────────────────────────────
# Maps WCR-77 class label → (human label, clinical detail, typical abnormal leads)
# Threshold: probability must exceed FINDING_THRESHOLD to be included
FINDING_THRESHOLD: float = 0.50

FINDING_MAP: dict[str, dict] = {
    "Normal_sinus_rhythm": {
        "label": "Normal Sinus Rhythm",
        "detail": "Regular cardiac rhythm within normal physiological limits.",
        "leads": [],
    },
    "Sinus_tachycardia": {
        "label": "Sinus Tachycardia",
        "detail": "Heart rate above 100 bpm with normal P-wave morphology.",
        "leads": ["II"],
    },
    "Sinus_bradycardia": {
        "label": "Sinus Bradycardia",
        "detail": "Heart rate below 60 bpm with normal P-wave morphology.",
        "leads": ["II"],
    },
    "ST_elevation_MI": {
        "label": "ST-Elevation Myocardial Infarction",
        "detail": "ST-elevation ≥ 1 mm in two or more contiguous leads, suggesting acute MI.",
        "leads": ["II", "III", "aVF", "V1", "V2", "V3", "V4", "V5"],
    },
    "ST_depression": {
        "label": "ST Depression",
        "detail": "ST-segment depression suggesting ischaemia or posterior MI.",
        "leads": ["V4", "V5", "V6"],
    },
    "T_wave_inversion": {
        "label": "T-Wave Inversion",
        "detail": "T-wave inversion which may indicate ischaemia or cardiomyopathy.",
        "leads": ["V1", "V2", "V3", "V4"],
    },
    "Atrial_fibrillation": {
        "label": "Atrial Fibrillation",
        "detail": "Irregularly irregular rhythm with absent P-waves.",
        "leads": ["I", "II", "V1"],
    },
    "Left_bundle_branch_block": {
        "label": "Left Bundle Branch Block",
        "detail": "Broad QRS > 120 ms with characteristic morphology in lateral leads.",
        "leads": ["I", "aVL", "V5", "V6"],
    },
    "Right_bundle_branch_block": {
        "label": "Right Bundle Branch Block",
        "detail": "Broad QRS > 120 ms with rsR' pattern in V1-V2.",
        "leads": ["V1", "V2"],
    },
    "First_degree_AV_block": {
        "label": "First Degree AV Block",
        "detail": "Prolonged PR interval > 200 ms.",
        "leads": ["II"],
    },
    "Left_ventricular_hypertrophy": {
        "label": "Left Ventricular Hypertrophy",
        "detail": "Increased QRS voltage meeting voltage criteria for LVH.",
        "leads": ["V5", "V6", "aVL"],
    },
}


def normalise_prediction(raw: RawPrediction) -> NormalisedPrediction:
    """
    Applies thresholding and label mapping to raw logits.

    Returns:
        NormalisedPrediction with structured Finding list.
    """
    findings: list[Finding] = []
    abnormal_leads: set[str] = set()

    for class_label, probability in raw.logits.items():
        if probability < FINDING_THRESHOLD:
            continue

        if class_label in FINDING_MAP:
            cfg = FINDING_MAP[class_label]
            finding = Finding(
                label=cfg["label"],
                detail=cfg["detail"],
                probability=round(probability, 3),
                affected_leads=cfg["leads"],
            )
            if class_label != "Normal_sinus_rhythm":
                abnormal_leads.update(cfg["leads"])
        else:
            # Unknown class above threshold — report generically
            finding = Finding(
                label=f"ECG Abnormality ({class_label})",
                detail=f"Automated finding with probability {probability:.2f}. "
                       f"Doctor review required.",
                probability=round(probability, 3),
                affected_leads=[],
            )

        findings.append(finding)

    # Sort: highest probability first
    findings.sort(key=lambda f: f.probability, reverse=True)

    # If no findings crossed threshold, add a low-confidence note
    if not findings:
        findings.append(Finding(
            label="No significant findings above threshold",
            detail="No ECG abnormalities detected above the confidence threshold. "
                   "Doctor review of original ECG is still required.",
            probability=0.0,
            affected_leads=[],
        ))

    # Overall confidence = max probability of top finding
    overall_confidence = findings[0].probability if findings else 0.0

    return NormalisedPrediction(
        findings=findings,
        abnormal_leads=sorted(abnormal_leads),
        overall_confidence=overall_confidence,
        model_name=raw.model_name,
        model_version=raw.model_version,
        inference_provider=raw.inference_provider,
    )
