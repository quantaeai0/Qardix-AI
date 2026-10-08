"""
Urgency Rule Engine

Deterministic, rule-based urgency classification.
All rules are explicit, auditable, and doctor-reviewable.

Clinical safety principle:
  - Urgency is DECISION SUPPORT only.
  - The treating doctor makes the final clinical decision.
  - No autonomous treatment recommendations are generated.

Urgency levels (from PRD):
    URGENT       — requires immediate medical attention
    REVIEW_SOON  — should be reviewed by a cardiologist soon
    ROUTINE      — normal or low-risk findings

Rules fire in URGENT → REVIEW_SOON order.
The first matching level is returned.
All triggered rules are logged for auditability.
"""

from __future__ import annotations

from app.ai.schema import NormalisedPrediction, UrgencyResult, UrgencyLevel


# ── Urgency rule tables ────────────────────────────────────────────────────────
# Each rule is a (finding_label_substring, urgency_level, description) tuple.
# Matching is case-insensitive substring match on finding labels.

URGENT_FINDING_PATTERNS: list[str] = [
    "ST-Elevation Myocardial Infarction",
    "Ventricular Fibrillation",
    "Ventricular Tachycardia",
    "Third Degree AV Block",
    "Complete Heart Block",
    "Torsades de Pointes",
]

REVIEW_SOON_FINDING_PATTERNS: list[str] = [
    "Atrial Fibrillation",
    "ST Depression",
    "T-Wave Inversion",
    "Left Bundle Branch Block",
    "Second Degree AV Block",
    "Left Ventricular Hypertrophy",
    "Wolff-Parkinson-White",
    "Sinus Tachycardia",
]

# High-confidence threshold for URGENT promotion
URGENT_CONFIDENCE_THRESHOLD: float = 0.85


def classify_urgency(prediction: NormalisedPrediction) -> UrgencyResult:
    """
    Applies deterministic rules to determine urgency level.

    Args:
        prediction: NormalisedPrediction from prediction_normaliser.

    Returns:
        UrgencyResult with level and list of triggered rules.
    """
    triggered_rules: list[str] = []

    # Collect finding labels for matching
    finding_labels = [f.label.lower() for f in prediction.findings]

    # ── Check URGENT patterns ─────────────────────────────────────────────────
    for pattern in URGENT_FINDING_PATTERNS:
        if any(pattern.lower() in label for label in finding_labels):
            triggered_rules.append(f"URGENT finding: {pattern}")

    # High-confidence finding automatically promotes to URGENT
    if prediction.overall_confidence >= URGENT_CONFIDENCE_THRESHOLD:
        high_conf_findings = [
            f for f in prediction.findings
            if f.probability >= URGENT_CONFIDENCE_THRESHOLD
            and f.label != "Normal Sinus Rhythm"
        ]
        for f in high_conf_findings:
            rule = f"High-confidence abnormality (p={f.probability:.2f}): {f.label}"
            if rule not in triggered_rules:
                triggered_rules.append(rule)

    # Promote to URGENT if any urgent rules fired
    urgent_rules = [r for r in triggered_rules if r.startswith("URGENT")]
    if urgent_rules:
        return UrgencyResult(
            level=UrgencyLevel.URGENT,
            triggered_rules=urgent_rules,
        )

    # ── Check REVIEW SOON patterns ────────────────────────────────────────────
    review_rules: list[str] = []
    for pattern in REVIEW_SOON_FINDING_PATTERNS:
        if any(pattern.lower() in label for label in finding_labels):
            review_rules.append(f"Review finding: {pattern}")

    if review_rules:
        return UrgencyResult(
            level=UrgencyLevel.REVIEW_SOON,
            triggered_rules=review_rules,
        )

    # ── ROUTINE ───────────────────────────────────────────────────────────────
    return UrgencyResult(
        level=UrgencyLevel.ROUTINE,
        triggered_rules=["No urgent or review-soon findings detected."],
    )
