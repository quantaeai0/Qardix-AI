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
  case_key?: "A" | "B" | "C";
}

export const URGENCY_LABEL: Record<Urgency, string> = {
  routine: "Routine",
  review_soon: "Review Soon",
  urgent: "Urgent Review",
};

