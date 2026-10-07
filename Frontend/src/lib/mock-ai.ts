export type Urgency = "routine" | "review_soon" | "urgent";

export interface EcgAnalysisInput {
  age: number;
  sex: string;
  heart_rate: number;
  spo2: number;
  bp_systolic: number;
  symptoms: Record<string, boolean>;
  image_path?: string | null | undefined;
}

/** Final output contract — mirrors the future FastAPI response. */
export interface EcgAnalysisResult {
  quality_status: "accepted" | "needs_reupload";
  ai_summary: string;
  findings: { label: string; detail: string }[];
  confidence: number;
  abnormal_leads: string[];
  urgency: Urgency;
  patient_explanation: string;
  warning_signs: string[];
  model_version: string;
  case_key: "A" | "B" | "C";
}

export const URGENCY_LABEL: Record<Urgency, string> = {
  routine: "Routine",
  review_soon: "Review Soon",
  urgent: "Urgent Review",
};

export const DEMO_CASES: Record<"A" | "B" | "C", Omit<EcgAnalysisResult, "quality_status" | "model_version" | "case_key">> = {
  A: {
    ai_summary: "Sinus rhythm; no major threshold-positive abnormality in demo output.",
    findings: [
      { label: "Rhythm", detail: "Regular sinus rhythm" },
      { label: "Rate", detail: "Within normal range" },
      { label: "Axis", detail: "Normal QRS axis" },
      { label: "Intervals", detail: "PR, QRS and QTc within expected limits" },
    ],
    confidence: 0.91,
    abnormal_leads: [],
    urgency: "routine",
    patient_explanation:
      "Your heart tracing shows a regular heartbeat and no major concerning pattern was highlighted. Your doctor has reviewed this result. Please continue follow-up as your doctor advises.",
    warning_signs: [
      "New chest pain or pressure",
      "Fainting or near-fainting",
      "Sudden severe breathlessness",
    ],
  },
  B: {
    ai_summary: "Possible atrial fibrillation; irregular rhythm pattern detected.",
    findings: [
      { label: "Rhythm", detail: "Irregularly irregular pattern suggestive of atrial fibrillation" },
      { label: "P waves", detail: "Not consistently identifiable" },
      { label: "Rate", detail: "Variable ventricular response" },
    ],
    confidence: 0.78,
    abnormal_leads: ["II", "V1"],
    urgency: "review_soon",
    patient_explanation:
      "Your heart tracing suggests the heartbeat may be irregular. This can happen when the upper chambers of the heart beat out of rhythm. Your doctor will explain what further checks may be needed.",
    warning_signs: [
      "Palpitations that become faster or constant",
      "Dizziness, fainting or confusion",
      "Chest pain or shortness of breath getting worse",
      "Sudden weakness of face, arm or leg, or trouble speaking — seek emergency care",
    ],
  },
  C: {
    ai_summary: "ST-T abnormality pattern requiring urgent clinician review.",
    findings: [
      { label: "ST segment", detail: "ST-segment changes in contiguous leads" },
      { label: "T waves", detail: "T-wave abnormality in lateral leads" },
      { label: "Rhythm", detail: "Sinus rhythm" },
    ],
    confidence: 0.83,
    abnormal_leads: ["V4", "V5", "V6", "I", "aVL"],
    urgency: "urgent",
    patient_explanation:
      "Your heart tracing shows a pattern that needs prompt medical review. This does not by itself confirm a diagnosis, but your doctor wants to look at it quickly and may recommend further tests.",
    warning_signs: [
      "Chest pain, pressure or tightness — seek emergency care immediately",
      "Fainting or collapse",
      "Severe breathlessness",
      "Pain spreading to the arm, jaw or back, or cold sweats",
    ],
  },
};

export function pickCase(input: EcgAnalysisInput): "A" | "B" | "C" {
  const s = input.symptoms ?? {};
  if (s['chest_pain'] || s['syncope']) return "C";
  if (s['palpitation'] || input.heart_rate > 100) return "B";
  return "A";
}
