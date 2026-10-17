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
FINDING_THRESHOLD: float = 0.35

# ── Finding configuration ──────────────────────────────────────────────────────
# Maps canonical names and aliases to human-readable labels, clinical details, and typical leads
CANONICAL_FINDINGS: list[dict] = [
    {
        "canonical": "normal sinus rhythm",
        "aliases": ["normal_sinus_rhythm", "sinusal", "sinus rhythm", "norm", "normal sinus"],
        "label": "Normal Sinus Rhythm",
        "detail": "Regular cardiac rhythm within normal physiological limits.",
        "leads": [],
        "is_abnormal": False,
    },
    {
        "canonical": "regular rhythm",
        "aliases": ["regular", "regular_rhythm", "regular cardiac rhythm"],
        "label": "Regular Rhythm",
        "detail": "Regular ventricular rate and consistent morphology.",
        "leads": [],
        "is_abnormal": False,
    },
    {
        "canonical": "st elevation myocardial infarction",
        "aliases": [
            "st_elevation_mi", "st elevation mi", "stemi", "st-elevation myocardial infarction",
            "acute stemi", "st elevation", "inferior stemi", "anterior stemi",
        ],
        "label": "ST-Elevation Myocardial Infarction",
        "detail": "ST-elevation ≥ 1 mm in two or more contiguous leads, suggesting acute MI.",
        "leads": ["II", "III", "aVF", "V1", "V2", "V3", "V4", "V5"],
        "is_abnormal": True,
    },
    {
        "canonical": "st depression",
        "aliases": ["st_depression", "st-depression", "st segment depression", "std"],
        "label": "ST Depression",
        "detail": "ST-segment depression suggesting subendocardial ischaemia or reciprocal changes.",
        "leads": ["V4", "V5", "V6"],
        "is_abnormal": True,
    },
    {
        "canonical": "t wave inversion",
        "aliases": ["t_wave_inversion", "t-wave inversion", "twi", "t wave inverted"],
        "label": "T-Wave Inversion",
        "detail": "T-wave inversion which may indicate ischaemia, strain, or cardiomyopathy.",
        "leads": ["V1", "V2", "V3", "V4"],
        "is_abnormal": True,
    },
    {
        "canonical": "sinus tachycardia",
        "aliases": ["sinus_tachycardia", "stach", "sinus tachy"],
        "label": "Sinus Tachycardia",
        "detail": "Heart rate above 100 bpm with normal P-wave morphology.",
        "leads": ["II"],
        "is_abnormal": True,
    },
    {
        "canonical": "sinus bradycardia",
        "aliases": ["sinus_bradycardia", "sbrady", "sinus brady"],
        "label": "Sinus Bradycardia",
        "detail": "Heart rate below 60 bpm with normal P-wave morphology.",
        "leads": ["II"],
        "is_abnormal": True,
    },
    {
        "canonical": "atrial fibrillation",
        "aliases": ["atrial_fibrillation", "afib", "a fib", "af"],
        "label": "Atrial Fibrillation",
        "detail": "Irregularly irregular rhythm with absent P-waves.",
        "leads": ["I", "II", "V1"],
        "is_abnormal": True,
    },
    {
        "canonical": "atrial flutter",
        "aliases": ["atrial_flutter", "aflt", "flutter"],
        "label": "Atrial Flutter",
        "detail": "Rapid regular atrial rate with characteristic saw-tooth flutter waves.",
        "leads": ["II", "III", "aVF", "V1"],
        "is_abnormal": True,
    },
    {
        "canonical": "left bundle branch block",
        "aliases": ["left_bundle_branch_block", "lbbb", "left bundle branch"],
        "label": "Left Bundle Branch Block",
        "detail": "Broad QRS > 120 ms with characteristic monomorphic R waves in lateral leads.",
        "leads": ["I", "aVL", "V5", "V6"],
        "is_abnormal": True,
    },
    {
        "canonical": "right bundle branch block",
        "aliases": ["right_bundle_branch_block", "rbbb", "right bundle branch"],
        "label": "Right Bundle Branch Block",
        "detail": "Broad QRS > 120 ms with rsR' pattern in V1-V2.",
        "leads": ["V1", "V2"],
        "is_abnormal": True,
    },
    {
        "canonical": "first degree av block",
        "aliases": ["first_degree_av_block", "1d_avb", "1avb", "first degree block", "pr prolongation"],
        "label": "First Degree AV Block",
        "detail": "Prolonged PR interval > 200 ms.",
        "leads": ["II"],
        "is_abnormal": True,
    },
    {
        "canonical": "left ventricular hypertrophy",
        "aliases": ["left_ventricular_hypertrophy", "lvh", "lvh voltage pattern"],
        "label": "Left Ventricular Hypertrophy",
        "detail": "Increased QRS voltage meeting voltage criteria for LVH.",
        "leads": ["V5", "V6", "aVL"],
        "is_abnormal": True,
    },
    {
        "canonical": "delta wave",
        "aliases": ["delta_wave", "wpw", "wolff parkinson white", "pre excitation"],
        "label": "Delta Wave (Pre-excitation / WPW Pattern)",
        "detail": "Slurred upstroke in QRS complex indicating ventricular pre-excitation.",
        "leads": ["I", "aVL", "V4", "V5", "V6"],
        "is_abnormal": True,
    },
    {
        "canonical": "atrial tachycardia (>= 100 bpm)",
        "aliases": ["atrial tachycardia (>= 100 bpm)", "atrial_tachycardia", "atrial tachycardia", "atach"],
        "label": "Atrial Tachycardia (≥ 100 BPM)",
        "detail": "Rapid regular atrial rate ≥ 100 bpm originating outside the SA node.",
        "leads": ["II", "III", "aVF", "V1"],
        "is_abnormal": True,
    },
    {
        "canonical": "inferior myocardial infarction",
        "aliases": ["inferior_myocardial_infarction", "imi", "inferior stemi", "inferior mi", "acute inferior mi"],
        "label": "Inferior Myocardial Infarction",
        "detail": "Pathological Q waves or ST elevation in leads II, III, aVF indicating inferior wall infarction.",
        "leads": ["II", "III", "aVF"],
        "is_abnormal": True,
    },
    {
        "canonical": "anterior myocardial infarction",
        "aliases": ["anterior_myocardial_infarction", "ami", "anterior stemi", "anterior mi", "acute anterior mi"],
        "label": "Anterior Myocardial Infarction",
        "detail": "ST elevation or Q waves across precordial leads V1-V4 indicating anterior wall infarction.",
        "leads": ["V1", "V2", "V3", "V4"],
        "is_abnormal": True,
    },
    {
        "canonical": "anteroseptal myocardial infarction",
        "aliases": ["anteroseptal_myocardial_infarction", "asmi", "anteroseptal mi"],
        "label": "Anteroseptal Myocardial Infarction",
        "detail": "Q waves or ST elevation in V1-V3 indicating septal involvement.",
        "leads": ["V1", "V2", "V3"],
        "is_abnormal": True,
    },
    {
        "canonical": "lateral myocardial infarction",
        "aliases": ["lateral_myocardial_infarction", "lmi", "lateral stemi", "lateral mi", "anterolateral mi", "almi"],
        "label": "Lateral Myocardial Infarction",
        "detail": "Infarction pattern in high lateral or precordial lateral leads I, aVL, V5, V6.",
        "leads": ["I", "aVL", "V5", "V6"],
        "is_abnormal": True,
    },
    {
        "canonical": "ventricular tachycardia",
        "aliases": ["ventricular_tachycardia", "vt", "v tach", "vtach"],
        "label": "Ventricular Tachycardia",
        "detail": "Broad complex tachycardia of ventricular origin, requiring immediate intervention.",
        "leads": ["II", "V1"],
        "is_abnormal": True,
    },
    {
        "canonical": "ventricular fibrillation",
        "aliases": ["ventricular_fibrillation", "vfib", "vf"],
        "label": "Ventricular Fibrillation",
        "detail": "Disorganised, chaotic ventricular depolarisation; hemodynamic collapse.",
        "leads": ["II", "V1"],
        "is_abnormal": True,
    },
    {
        "canonical": "premature ventricular contractions",
        "aliases": ["premature_ventricular_contractions", "pvc", "pvcs", "vpb", "ventricular premature beats"],
        "label": "Premature Ventricular Contractions",
        "detail": "Ectopic ventricular beats with wide bizarre QRS not preceded by P wave.",
        "leads": ["II", "V1"],
        "is_abnormal": True,
    },
    {
        "canonical": "premature atrial contractions",
        "aliases": ["premature_atrial_contractions", "pac", "pacs", "apb", "svpb", "atrial ectopy"],
        "label": "Premature Atrial Contractions",
        "detail": "Premature ectopic P waves differing in morphology from sinus P wave.",
        "leads": ["II"],
        "is_abnormal": True,
    },
    {
        "canonical": "second degree av block",
        "aliases": ["second_degree_av_block", "2avb", "mobitz", "wenckebach"],
        "label": "Second Degree AV Block",
        "detail": "Intermittent failure of AV conduction.",
        "leads": ["II"],
        "is_abnormal": True,
    },
    {
        "canonical": "third degree av block",
        "aliases": ["third_degree_av_block", "3avb", "complete heart block", "chb", "complete av block"],
        "label": "Third Degree AV Block (Complete Heart Block)",
        "detail": "Complete AV dissociation with slower junctional or ventricular escape rhythm.",
        "leads": ["II", "V1"],
        "is_abnormal": True,
    },
    {
        "canonical": "left anterior fascicular block",
        "aliases": ["left_anterior_fascicular_block", "lafb", "lahb", "left anterior hemiblock"],
        "label": "Left Anterior Fascicular Block",
        "detail": "Left axis deviation (-45 to -90 deg) with qR in I/aVL and rS in II/III/aVF.",
        "leads": ["I", "aVL", "II", "III", "aVF"],
        "is_abnormal": True,
    },
    {
        "canonical": "right ventricular hypertrophy",
        "aliases": ["right_ventricular_hypertrophy", "rvh"],
        "label": "Right Ventricular Hypertrophy",
        "detail": "Dominant R wave in V1 (R/S > 1) with right axis deviation.",
        "leads": ["V1", "V2", "aVF"],
        "is_abnormal": True,
    },
    {
        "canonical": "qt prolongation",
        "aliases": ["qt_prolongation", "long qt", "long_qt", "lngqt", "prolonged qtc"],
        "label": "Long QT Interval",
        "detail": "Prolonged QTc interval increasing risk of ventricular tachyarrhythmias.",
        "leads": ["II", "V5"],
        "is_abnormal": True,
    },
    {
        "canonical": "acute pericarditis",
        "aliases": ["acute_pericarditis", "pericarditis", "acute pericarditis pattern"],
        "label": "Acute Pericarditis",
        "detail": "Widespread concave upward ST-segment elevation with PR-segment depression.",
        "leads": ["I", "II", "aVL", "aVF", "V2", "V3", "V4", "V5", "V6"],
        "is_abnormal": True,
    },
    {
        "canonical": "bi-atrial enlargement",
        "aliases": ["bi-atrial enlargement", "biatrial enlargement", "bi_atrial_enlargement", "bae"],
        "label": "Bi-Atrial Enlargement",
        "detail": "Signs of both left and right atrial abnormality (tall peaked P-wave and biphasic V1).",
        "leads": ["II", "V1"],
        "is_abnormal": True,
    },
    {
        "canonical": "sv1 + rv5 or rv6 > 35 mm",
        "aliases": ["sv1 + rv5 or rv6 > 35 mm", "sv1+rv5", "sv1 + rv5", "sokolow lyon lvh"],
        "label": "Left Ventricular Hypertrophy (Voltage Criteria: SV1 + RV5/RV6 > 35mm)",
        "detail": "Sokolow-Lyon voltage criteria for left ventricular hypertrophy.",
        "leads": ["V1", "V5", "V6"],
        "is_abnormal": True,
    },
    {
        "canonical": "rv1 + sv6 > 11 mm",
        "aliases": ["rv1 + sv6 > 11 mm", "rv1+sv6", "rv1 + sv6", "sokolow lyon rvh"],
        "label": "Right Ventricular Hypertrophy (Voltage Criteria: RV1 + SV6 > 11mm)",
        "detail": "Sokolow-Lyon voltage criteria for right ventricular hypertrophy.",
        "leads": ["V1", "V6"],
        "is_abnormal": True,
    },
    {
        "canonical": "ventricular paced",
        "aliases": ["ventricular paced", "ventricular_paced", "paced rhythm", "ventricular pacing"],
        "label": "Ventricular Paced Rhythm",
        "detail": "Pacing spikes followed by broad ventricular complexes.",
        "leads": ["II", "V1"],
        "is_abnormal": True,
    },
    {
        "canonical": "irregularly irregular",
        "aliases": ["irregularly irregular", "irregularly_irregular", "irregularly irregular rhythm"],
        "label": "Atrial Fibrillation (Irregularly Irregular)",
        "detail": "Irregularly irregular ventricular response characteristic of atrial fibrillation.",
        "leads": ["I", "II", "V1"],
        "is_abnormal": True,
    },
    {
        "canonical": "early repolarization",
        "aliases": ["early repolarization", "early_repolarization", "early repol", "erp"],
        "label": "Early Repolarization Pattern",
        "detail": "J-point elevation ≥ 1 mm in two contiguous leads with slurring or notching of QRS.",
        "leads": ["V2", "V3", "V4", "V5"],
        "is_abnormal": True,
    },
    {
        "canonical": "q wave (anterior - v3-v4)",
        "aliases": ["q wave (anterior - v3-v4)", "q wave anterior", "q wave v3 v4", "pathological q anterior"],
        "label": "Pathological Q Waves (Anterior Leads V3-V4)",
        "detail": "Pathological Q waves indicating transmural anterior myocardial infarction.",
        "leads": ["V3", "V4"],
        "is_abnormal": True,
    },
    {
        "canonical": "r/s ratio in v1-v2 >1",
        "aliases": ["r/s ratio in v1-v2 >1", "r/s ratio in v1-v2 > 1", "r/s > 1 in v1 v2", "dominant r v1"],
        "label": "Dominant R Wave in V1-V2 (R/S > 1)",
        "detail": "R/S ratio > 1 in leads V1-V2, consistent with RVH, posterior MI, or WPW.",
        "leads": ["V1", "V2"],
        "is_abnormal": True,
    },
    {
        "canonical": "right atrial enlargement",
        "aliases": ["right_atrial_enlargement", "rae", "p pulmonale", "right atrial abnormality"],
        "label": "Right Atrial Enlargement",
        "detail": "Peaked P-wave amplitude ≥ 2.5 mm in inferior leads (P-pulmonale).",
        "leads": ["II", "III", "aVF"],
        "is_abnormal": True,
    },
    {
        "canonical": "u wave",
        "aliases": ["u wave", "u_wave", "prominent u wave"],
        "label": "Prominent U Waves",
        "detail": "Deflection following T-wave, commonly associated with hypokalemia or bradycardia.",
        "leads": ["V2", "V3"],
        "is_abnormal": True,
    },
]

# Build fast normalisation lookup dictionary
_LOOKUP: dict[str, dict] = {}
for entry in CANONICAL_FINDINGS:
    _LOOKUP[entry["canonical"]] = entry
    for alias in entry.get("aliases", []):
        _LOOKUP[alias.lower().replace("_", " ").replace("-", " ").strip()] = entry


def _match_finding_config(raw_name: str) -> dict | None:
    norm_key = raw_name.lower().replace("_", " ").replace("-", " ").strip()
    # 1. Exact match
    if norm_key in _LOOKUP:
        return _LOOKUP[norm_key]

    norm_words = norm_key.split()

    # 2. Safe word-boundary and specific key search
    # Sort longer keys first so specific matches take precedence
    sorted_lookup = sorted(_LOOKUP.items(), key=lambda x: len(x[0]), reverse=True)
    for key, cfg in sorted_lookup:
        # Prevent "regular" from matching "irregularly irregular"
        if "irregular" in norm_key and "irregular" not in key:
            continue
        # Short keys (<= 4 chars) like "pac", "af", "pvc" must match whole words only
        if len(key) <= 4:
            if key in norm_words:
                return cfg
        else:
            if key in norm_key:
                return cfg

    return None


def normalise_prediction(raw: RawPrediction) -> NormalisedPrediction:
    """
    Applies calibrated thresholding and canonical label mapping to model logits.
    Supports both Colab per-class above_threshold flags and confidence thresholding.

    Returns:
        NormalisedPrediction with structured Finding list and flagged abnormal leads.
    """
    findings: list[Finding] = []
    abnormal_leads: set[str] = set()
    seen_labels: set[str] = set()

    # Prefer raw.top_findings if available, otherwise logits
    candidates = raw.top_findings if raw.top_findings else [
        {"label": k, "probability": v, "above_threshold": v >= FINDING_THRESHOLD}
        for k, v in raw.logits.items()
    ]

    for item in candidates:
        raw_label = item.get("label", "Unknown")
        probability = float(item.get("probability", 0.0))
        above_threshold = item.get("above_threshold", probability >= FINDING_THRESHOLD)

        # Include if model explicitly marked above_threshold=True OR probability >= 0.35
        if not above_threshold and probability < FINDING_THRESHOLD:
            continue

        cfg = _match_finding_config(raw_label)
        if cfg:
            clean_label = cfg["label"]
            if clean_label in seen_labels:
                continue
            seen_labels.add(clean_label)

            findings.append(Finding(
                label=clean_label,
                detail=cfg["detail"],
                probability=round(probability, 3),
                affected_leads=cfg["leads"],
            ))
            if cfg.get("is_abnormal", True):
                abnormal_leads.update(cfg["leads"])
        else:
            # Unmapped WCR-77 class above threshold
            clean_label = raw_label.replace("_", " ").strip().title()
            if clean_label in seen_labels:
                continue
            seen_labels.add(clean_label)

            findings.append(Finding(
                label=clean_label,
                detail=f"Automated AI finding with probability {probability:.1%}. Doctor review required.",
                probability=round(probability, 3),
                affected_leads=[],
            ))
            if "normal" not in clean_label.lower() and "sinusal" not in clean_label.lower() and "regular" not in clean_label.lower():
                pass


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
