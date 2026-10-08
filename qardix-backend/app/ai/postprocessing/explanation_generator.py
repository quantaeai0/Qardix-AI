"""
Patient Explanation & Warning Signs Generator

Generates patient-friendly (non-technical) explanations and warning signs.

Clinical safety:
  - NOT a diagnosis.
  - NOT a treatment recommendation.
  - Presented as safety guidance reviewed and approved by the treating doctor.
  - Always labelled as AI-assisted.

V1 approach: curated text templates (PRD §Developer Brief).
Future option: Qwen3-4B-Instruct-2507 or Llama 3.2 3B local LLM
  — only after template-based approach is validated.

Template selection is driven by urgency level + top findings.
"""

from __future__ import annotations

from app.ai.schema import (
    NormalisedPrediction,
    UrgencyResult,
    UrgencyLevel,
    PatientExplanation,
)


# ── Patient explanation templates ─────────────────────────────────────────────

_TEMPLATES: dict[str, dict[str, str | list[str]]] = {

    "urgent": {
        "text": (
            "Your ECG shows patterns that require immediate medical attention. "
            "The heart's electrical signals suggest there may be a problem with blood "
            "flow to part of the heart. Your doctor has reviewed this result and will "
            "advise you on the next steps. Please follow your doctor's instructions "
            "without delay."
        ),
        "warning_signs": [
            "Call emergency services (112/108) immediately if you experience "
            "severe or crushing chest pain spreading to your arm, jaw, or shoulder.",
            "Seek immediate care for sudden severe shortness of breath or difficulty breathing.",
            "Call for help if you experience fainting, collapse, or loss of consciousness.",
            "Seek urgent care for sudden profuse sweating, nausea, or extreme weakness.",
            "Do not drive yourself to the hospital — call for emergency assistance.",
        ],
    },

    "review_soon": {
        "text": (
            "Your ECG shows some patterns that your doctor would like to review further. "
            "This does not necessarily mean a serious problem, but it is important to "
            "follow up with your doctor soon. Your doctor will explain what these findings "
            "mean for your specific health situation."
        ),
        "warning_signs": [
            "See your doctor promptly if you experience any new or worsening chest pain or discomfort.",
            "Seek medical attention for new palpitations, irregular heartbeat, or a fluttering sensation.",
            "Consult your doctor for new shortness of breath during activities you could do before.",
            "Seek care for episodes of dizziness, lightheadedness, or near-fainting.",
            "Contact your doctor if any symptoms worsen or new symptoms develop before your appointment.",
        ],
    },

    "routine": {
        "text": (
            "Your ECG result appears within normal limits. No urgent cardiac warnings "
            "have been detected by the AI analysis. Your doctor has reviewed this result. "
            "Continue following your doctor's advice regarding your overall heart health "
            "and any other medical conditions you may have."
        ),
        "warning_signs": [
            "Always seek immediate medical care if you experience new chest pain, "
            "fainting, or severe shortness of breath, even after a normal ECG.",
            "Maintain regular follow-up appointments with your doctor.",
            "Report any new cardiac symptoms to your doctor promptly.",
        ],
    },

    # Finding-specific overrides — merged into base template if present
    "atrial_fibrillation": {
        "extra_text": (
            " The ECG suggests an irregular heart rhythm called atrial fibrillation (AF). "
            "This is a common condition that your doctor will evaluate further."
        ),
        "extra_warnings": [
            "Be aware of sudden irregular or rapid heartbeat sensations.",
            "Report any new dizziness or weakness to your doctor.",
        ],
    },
}


# ── Generator ─────────────────────────────────────────────────────────────────

def generate_patient_explanation(
    prediction: NormalisedPrediction,
    urgency: UrgencyResult,
) -> PatientExplanation:
    """
    Selects and assembles patient-friendly explanation + warning signs.

    Args:
        prediction: NormalisedPrediction — finding labels drive template selection.
        urgency: UrgencyResult — primary template key.

    Returns:
        PatientExplanation with text + warning_signs list.
    """
    urgency_key = urgency.level.value.replace("_", "_")  # routine | review_soon | urgent

    # Map UrgencyLevel to template key
    template_key_map = {
        UrgencyLevel.URGENT:      "urgent",
        UrgencyLevel.REVIEW_SOON: "review_soon",
        UrgencyLevel.ROUTINE:     "routine",
    }
    key = template_key_map.get(urgency.level, "routine")
    base = _TEMPLATES[key]

    explanation_text: str = str(base["text"])
    warning_signs: list[str] = list(base["warning_signs"])  # type: ignore[arg-type]

    # Check for finding-specific additions
    finding_labels_lower = {f.label.lower() for f in prediction.findings}
    if "atrial fibrillation" in finding_labels_lower:
        af = _TEMPLATES.get("atrial_fibrillation", {})
        if "extra_text" in af:
            explanation_text += str(af["extra_text"])
        if "extra_warnings" in af:
            warning_signs.extend(list(af["extra_warnings"]))  # type: ignore[arg-type]

    return PatientExplanation(
        text=explanation_text,
        warning_signs=warning_signs,
        source="template",
    )


def build_ai_summary(prediction: NormalisedPrediction) -> str:
    """
    Builds a concise, doctor-facing AI ECG summary string.
    Not patient-facing — uses clinical terminology.
    """
    if not prediction.findings:
        return "No significant ECG findings detected above confidence threshold."

    top = prediction.findings[0]

    if top.label == "Normal Sinus Rhythm" and len(prediction.findings) == 1:
        return (
            f"Normal Sinus Rhythm. No significant ST-T wave abnormalities or "
            f"conduction defects observed. Overall confidence: {top.probability:.0%}."
        )

    finding_lines = "; ".join(
        f"{f.label} (p={f.probability:.2f})" for f in prediction.findings[:4]
    )

    leads_note = ""
    if prediction.abnormal_leads:
        leads_note = f" Abnormal leads: {', '.join(prediction.abnormal_leads)}."

    return (
        f"AI-assisted ECG analysis identified: {finding_lines}.{leads_note} "
        f"Doctor review required before clinical decisions are made."
    )
