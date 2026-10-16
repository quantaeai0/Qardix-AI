"""
Groq LLM Clinical Reasoning Engine
===================================

Transforms raw model predictions + patient clinical context into a
fully-structured 2-page clinical report payload using Groq's API
with qwen/qwen3-27b.

Key design decisions:
  - JSON mode with explicit schema - guarantees every key is present.
  - Hard 20-second timeout so slow Groq responses don't block uploads.
  - Full deterministic fallback - if Groq is unavailable for any reason
    (missing key, network error, timeout, parse failure) the pipeline
    continues cleanly using rule-based data. No silent failures.
  - Clinical disclaimer is always present in the payload.
  - The returned dict is stored verbatim as clinical_report inside
    raw_output_json in AiResult, and surfaced in the API response.

Safety:
  - The LLM is explicitly instructed it is NOT issuing a diagnosis.
  - The prompt enforces "Doctor review required" framing.
  - All outputs carry the Qardix AI clinical disclaimer.
"""

from __future__ import annotations

import json
import logging
import asyncio
from typing import Any, Dict, List, Optional

from app.ai.schema import NormalisedPrediction, UrgencyResult, UrgencyLevel
from app.config import settings

logger = logging.getLogger(__name__)

# ---- Compact JSON Schema sent to Groq (kept small for free-tier token limits) -----
_REPORT_SCHEMA = '{"ecg_impression":"str","overall_confidence":"High|Moderate-High|Moderate|Low","clinical_priority":"URGENT|REVIEW_SOON|ROUTINE","clinical_priority_reason":"str","diagnostic_pills":[{"label":"str","tone":"normal|warning|urgent"}],"quantitative_metrics":{"heart_rate_bpm":0,"pr_interval_ms":0,"qrs_duration_ms":0,"qt_ms":0,"qtc_ms":0,"electrical_axis_deg":"str","ecg_quality_text":"str"},"top_ai_findings":[{"priority":1,"ai_finding":"str","lead_region":"str","confidence":"str","doctor_review":"str"}],"findings_requiring_attention":[{"title":"str","description":"str"}],"lead_wise_review":[{"lead_group":"I / aVL","ai_observation":"str","status":"Normal|Review|Attention|Correlate"},{"lead_group":"II / III / aVF","ai_observation":"str","status":"str"},{"lead_group":"V1-V3","ai_observation":"str","status":"str"},{"lead_group":"V4-V6","ai_observation":"str","status":"str"}],"clinical_correlations":[{"clinical_factor":"str","current_data":"str","why_it_matters":"str"}],"previous_ecg_comparison":{"prior_ecg_date":null,"comparison_note":"str"},"red_flag_review":{"status":"str","summary":"str"},"patient_communication_summary":"str","patient_explanation":"str","warning_signs":["str"]}'

_SYSTEM_PROMPT = (
    "Clinical ECG decision-support assistant for Qardix AI (doctor-review platform). "
    "RULES: 1) Not a diagnosis — structured decision-support only. "
    "2) Frame findings as 'possible' or 'may be compatible with'. "
    "3) Doctor review always required. "
    "4) Return ONLY compact valid JSON — no markdown, no extra text. "
    "5) All 4 lead_wise_review groups (I/aVL, II/III/aVF, V1-V3, V4-V6) required. "
    "6) Use heart_rate from patient context for heart_rate_bpm. "
    "7) Estimate PR/QRS/QT/QTc/axis from findings using clinical norms."
)



async def generate_clinical_intelligence_report(
    normalised: NormalisedPrediction,
    urgency: UrgencyResult,
    clinical_context: Dict[str, Any],
    prior_ecg: Optional[Dict[str, Any]] = None,
    deterministic_only: bool = False,
) -> Dict[str, Any]:
    if deterministic_only or not settings.GROQ_API_KEY or settings.GROQ_API_KEY in ("", "PASTE_YOUR_GROQ_API_KEY_HERE"):
        if not deterministic_only:
            logger.info("GROQ_API_KEY not set - using deterministic clinical report fallback")
        return _deterministic_fallback(normalised, urgency, clinical_context, prior_ecg)
    try:
        result = await asyncio.wait_for(
            _call_groq(normalised, urgency, clinical_context, prior_ecg),
            timeout=15.0,
        )
        logger.info("Groq clinical reasoning: success")
        return result
    except asyncio.TimeoutError:
        logger.warning("Groq timed out (15s) - using deterministic fallback")
        return _deterministic_fallback(normalised, urgency, clinical_context, prior_ecg)
    except Exception as exc:
        logger.warning(f"Groq failed ({exc}) - using deterministic fallback")
        return _deterministic_fallback(normalised, urgency, clinical_context, prior_ecg)


async def _call_groq(
    normalised: NormalisedPrediction,
    urgency: UrgencyResult,
    clinical_context: Dict[str, Any],
    prior_ecg: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    try:
        from groq import AsyncGroq, RateLimitError  # type: ignore
    except ImportError:
        raise RuntimeError("groq package not installed. Run: pip install groq")

    client = AsyncGroq(api_key=settings.GROQ_API_KEY, max_retries=0)
    user_prompt = _build_user_prompt(normalised, urgency, clinical_context, prior_ecg)
    try:
        response = await client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.15,
            max_tokens=850,   # Keep safely within free-tier 1,000 OTPM ceiling
            response_format={"type": "json_object"},
        )
        raw_json = response.choices[0].message.content
        parsed = json.loads(raw_json)
        return _validate_and_fill(parsed, normalised, urgency, clinical_context, prior_ecg)
    except RateLimitError as rle:
        logger.warning(f"Groq rate limit encountered (8k TPM limit): {rle}. Using instant deterministic fallback.")
        return _deterministic_fallback(normalised, urgency, clinical_context, prior_ecg)


def _build_user_prompt(
    normalised: NormalisedPrediction,
    urgency: UrgencyResult,
    clinical_context: Dict[str, Any],
    prior_ecg: Optional[Dict[str, Any]],
) -> str:
    ctx = clinical_context
    findings_text = "\n".join(
        f"  - {f.label}: probability={f.probability:.2f}, leads={f.affected_leads}"
        for f in normalised.findings
    )
    symptoms = ctx.get("symptoms", {})
    active_symptoms = [k for k, v in symptoms.items() if v]
    return f"""PATIENT CLINICAL CONTEXT:
Age: {ctx.get('age', 'Unknown')} | Sex: {ctx.get('sex', 'Unknown')}
Height: {ctx.get('height_cm', '-')} cm | Weight: {ctx.get('weight_kg', '-')} kg | BMI: {ctx.get('bmi', '-')}
Blood Pressure: {ctx.get('bp_systolic', '-')}/{ctx.get('bp_diastolic', '-')} mmHg
Heart Rate: {ctx.get('heart_rate', '-')} bpm | SpO2: {ctx.get('spo2', '-')}%
Diabetes: {ctx.get('diabetes_status', 'Unknown')}
Complications: {', '.join(ctx.get('diabetic_complications', [])) or 'None'}
Symptoms: {', '.join(active_symptoms) or 'None reported'}
Medicines: {', '.join(ctx.get('medicines', [])) or 'None'}

AI MODEL FINDINGS (DeepECG WCR-77):
Overall confidence: {normalised.overall_confidence:.2f}
Abnormal leads: {', '.join(normalised.abnormal_leads) or 'None'}
Top predictions:
{findings_text}

URGENCY: {urgency.level.value.upper()}
Rules triggered: {'; '.join(urgency.triggered_rules)}

PRIOR ECG: {json.dumps(prior_ecg) if prior_ecg else 'No prior ECG on file'}

Generate the complete structured clinical report JSON matching this schema exactly:
{_REPORT_SCHEMA}"""


def _validate_and_fill(
    parsed: Dict[str, Any],
    normalised: NormalisedPrediction,
    urgency: UrgencyResult,
    clinical_context: Dict[str, Any],
    prior_ecg: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    fallback = _deterministic_fallback(normalised, urgency, clinical_context, prior_ecg)
    for key, value in fallback.items():
        if key not in parsed or parsed[key] is None:
            parsed[key] = value
    existing_groups = {row.get("lead_group") for row in parsed.get("lead_wise_review", [])}
    required_groups = ["I / aVL", "II / III / aVF", "V1-V3", "V4-V6"]
    for group in required_groups:
        if group not in existing_groups:
            parsed.setdefault("lead_wise_review", []).append({
                "lead_group": group,
                "ai_observation": "No significant abnormality flagged in this group.",
                "status": "Review",
            })
    # Stamp source: Groq actually ran (not deterministic fallback)
    parsed["generated_by"] = "groq"
    return parsed


def _deterministic_fallback(
    normalised: NormalisedPrediction,
    urgency: UrgencyResult,
    clinical_context: Dict[str, Any],
    prior_ecg: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    ctx = clinical_context
    hr = ctx.get("heart_rate", 75)
    bp_sys = ctx.get("bp_systolic", 120)
    bp_dia = ctx.get("bp_diastolic", 80)
    spo2 = ctx.get("spo2", 98)
    diabetes = ctx.get("diabetes_status", "Unknown")
    symptoms = ctx.get("symptoms", {})

    abnormal_leads = normalised.abnormal_leads
    finding_labels = [f.label.lower() for f in normalised.findings]

    rr_ms = 60000 / max(hr, 40)
    pr_ms = 160 if hr < 100 else 140
    qrs_ms = 100 if not any("bundle" in l or "block" in l for l in finding_labels) else 130
    qt_ms = max(300, int(390 - 0.4 * (hr - 70)))
    qtc_ms = int(qt_ms / (rr_ms / 1000) ** 0.5)
    axis = "+18 deg" if any("lvh" in l or "hypertrophy" in l for l in finding_labels) else "+45 deg"
    quality_pct = int(normalised.overall_confidence * 100)

    priority_map = {
        UrgencyLevel.URGENT: "URGENT",
        UrgencyLevel.REVIEW_SOON: "REVIEW_SOON",
        UrgencyLevel.ROUTINE: "ROUTINE",
    }
    priority = priority_map[urgency.level]

    pills: List[Dict[str, str]] = []
    if any("sinus" in l for l in finding_labels):
        pills.append({"label": "Sinus Rhythm", "tone": "normal"})
    for f in normalised.findings:
        if "normal" not in f.label.lower():
            tone = "urgent" if urgency.level == UrgencyLevel.URGENT else "warning"
            pills.append({"label": f"Possible {_readable(f.label)}", "tone": tone})
    if not pills:
        pills = [{"label": "Sinus Rhythm", "tone": "normal"}]

    finding_summary = "; ".join(f"{_readable(f.label)} (p={f.probability:.2f})" for f in normalised.findings[:3])
    leads_note = f" Flagged leads: {', '.join(abnormal_leads)}." if abnormal_leads else ""
    impression = (
        f"AI-assisted analysis: {finding_summary}.{leads_note} "
        f"Clinical correlation and doctor review advised."
    )

    conf = normalised.overall_confidence
    conf_label = "High" if conf >= 0.85 else "Moderate-High" if conf >= 0.7 else "Moderate" if conf >= 0.5 else "Low"

    top_findings_table = []
    for i, f in enumerate(normalised.findings[:5], 1):
        fconf = "High" if f.probability >= 0.85 else "Moderate-High" if f.probability >= 0.7 else "Moderate"
        top_findings_table.append({
            "priority": i,
            "ai_finding": _readable(f.label),
            "lead_region": ", ".join(f.affected_leads) if f.affected_leads else "Global",
            "confidence": fconf,
            "doctor_review": "Correlate clinically" if i == 1 else "Confirm on tracing",
        })

    attention_cards = []
    for f in normalised.findings[:2]:
        if "normal" not in f.label.lower():
            attention_cards.append({
                "title": f"Possible {_readable(f.label)}",
                "description": (
                    f"AI identified possible {_readable(f.label).lower()} morphology. "
                    f"{'Flagged in leads: ' + ', '.join(f.affected_leads) + '. ' if f.affected_leads else ''}"
                    f"Review in context of symptoms, previous ECG, and medications."
                ),
            })
    if not attention_cards:
        attention_cards = [{"title": "No Urgent Findings", "description": "No major abnormalities requiring immediate attention detected."}]

    def _lead_status(group_leads: List[str]) -> str:
        if not abnormal_leads:
            return "Review"
        if any(l in abnormal_leads for l in group_leads):
            return "Attention" if urgency.level != UrgencyLevel.ROUTINE else "Review"
        return "Review"

    lead_wise = [
        {"lead_group": "I / aVL", "ai_observation": "Possible high-lateral changes." if any(l in abnormal_leads for l in ["I", "aVL"]) else "No major abnormality flagged.", "status": _lead_status(["I", "aVL"])},
        {"lead_group": "II / III / aVF", "ai_observation": "Possible inferior ST-T morphology change." if any(l in abnormal_leads for l in ["II", "III", "aVF"]) else "No dominant inferior abnormality flagged.", "status": _lead_status(["II", "III", "aVF"])},
        {"lead_group": "V1-V3", "ai_observation": "Possible anteroseptal changes." if any(l in abnormal_leads for l in ["V1", "V2", "V3"]) else "No dominant anteroseptal abnormality flagged.", "status": _lead_status(["V1", "V2", "V3"])},
        {"lead_group": "V4-V6", "ai_observation": "Possible anterolateral pattern." if any(l in abnormal_leads for l in ["V4", "V5", "V6"]) else "No significant anterolateral abnormality flagged.", "status": _lead_status(["V4", "V5", "V6"])},
    ]

    correlations = [{
        "clinical_factor": "Blood Pressure",
        "current_data": f"{bp_sys}/{bp_dia} mmHg",
        "why_it_matters": "Elevated BP may be relevant to voltage pattern and cardiovascular risk." if bp_sys >= 140 else "BP within normal range for this assessment.",
    }, {
        "clinical_factor": "Diabetes",
        "current_data": diabetes,
        "why_it_matters": "Important cardiovascular risk context when interpreting ECG abnormalities." if "type" in diabetes.lower() else "No active diabetes recorded.",
    }]
    for sym, val in symptoms.items():
        if val:
            correlations.append({
                "clinical_factor": sym.replace("_", " ").title(),
                "current_data": "Present",
                "why_it_matters": f"Correlate {sym.replace('_', ' ')} with ECG findings and clinical examination.",
            })
    correlations.append({
        "clinical_factor": "SpO2",
        "current_data": f"{spo2}%",
        "why_it_matters": "Low oxygen saturation - correlate with respiratory assessment." if spo2 < 94 else f"SpO2 {spo2}% - within acceptable range.",
    })

    reasons = []
    if bp_sys >= 140:
        reasons.append("elevated BP")
    if "type" in diabetes.lower():
        reasons.append("diabetes")
    active_syms = [k for k, v in symptoms.items() if v]
    if active_syms:
        reasons.append(", ".join(s.replace("_", " ") for s in active_syms))
    if normalised.findings and "normal" not in normalised.findings[0].label.lower():
        reasons.append("ECG abnormality detected")
    priority_reason = (
        f"{', '.join(reasons).capitalize()}. This is not an autonomous diagnosis - doctor review required."
        if reasons else "No high-risk features detected. Routine review advised."
    )

    ecg_comparison = {
        "prior_ecg_date": prior_ecg.get("date") if prior_ecg else None,
        "comparison_note": prior_ecg.get("note", "Prior ECG on file.") if prior_ecg else "No prior ECG on file for comparison.",
    }

    is_urgent = urgency.level == UrgencyLevel.URGENT
    red_flag = {
        "status": "PHYSICIAN REVIEW REQUIRED" if is_urgent else "Physician review required",
        "summary": (
            "HIGH-CONFIDENCE LIFE-THREATENING PATTERN DETECTED. Immediate physician review is mandatory."
            if is_urgent else
            "No autonomous emergency diagnosis is issued. ECG findings should be interpreted together with the patient's symptoms and risk profile."
        ),
    }

    return {
        "ecg_impression": impression,
        "overall_confidence": conf_label,
        "clinical_priority": priority,
        "clinical_priority_reason": priority_reason,
        "diagnostic_pills": pills[:4],
        "quantitative_metrics": {
            "heart_rate_bpm": hr,
            "pr_interval_ms": pr_ms,
            "qrs_duration_ms": qrs_ms,
            "qt_ms": qt_ms,
            "qtc_ms": qtc_ms,
            "electrical_axis_deg": axis,
            "ecg_quality_text": f"{'Good' if quality_pct >= 80 else 'Fair'} - {quality_pct}%",
        },
        "top_ai_findings": top_findings_table,
        "findings_requiring_attention": attention_cards,
        "lead_wise_review": lead_wise,
        "clinical_correlations": correlations,
        "previous_ecg_comparison": ecg_comparison,
        "red_flag_review": red_flag,
        "patient_communication_summary": (
            f"Your ECG has been reviewed. "
            f"{'The findings include patterns that your doctor will evaluate further. ' if urgency.level != UrgencyLevel.ROUTINE else 'No urgent patterns were detected. '}"
            f"Your doctor will advise on the next steps."
        ),
        "patient_explanation": (
            f"Your ECG has been analysed. "
            f"{'Results show patterns your doctor will review carefully. ' if urgency.level != UrgencyLevel.ROUTINE else 'No urgent patterns detected. '}"
            f"Please follow your doctor's advice."
        ),
        "warning_signs": [
            "Call emergency services immediately if you experience severe crushing chest pain.",
            "Seek immediate care for sudden severe shortness of breath.",
            "Call for help if you feel faint, collapse, or lose consciousness.",
            "Contact your doctor promptly if any symptoms worsen.",
        ],
        "generated_by": "deterministic_fallback",
    }


def _readable(label: str) -> str:
    return label.replace("_", " ").replace("-", " ").strip()
