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

// ── Clinical Report Schema (mirrors clinical_reasoning.py output) ─────────────

export interface DiagnosticPill {
  label: string;
  tone: "normal" | "warning" | "urgent";
}

export interface QuantitativeMetrics {
  heart_rate_bpm: number;
  pr_interval_ms: number;
  qrs_duration_ms: number;
  qt_ms: number;
  qtc_ms: number;
  electrical_axis_deg: string;
  ecg_quality_text: string;
}

export interface TopAiFinding {
  priority: number;
  ai_finding: string;
  lead_region: string;
  confidence: string;
  doctor_review: string;
}

export interface AttentionCard {
  title: string;
  description: string;
}

export interface LeadWiseReview {
  lead_group: string;
  ai_observation: string;
  status: "Normal" | "Review" | "Attention" | "Correlate";
}

export interface ClinicalCorrelation {
  clinical_factor: string;
  current_data: string;
  why_it_matters: string;
}

export interface ClinicalReport {
  ecg_impression: string;
  overall_confidence: string;
  clinical_priority: "URGENT" | "REVIEW_SOON" | "ROUTINE";
  clinical_priority_reason: string;
  diagnostic_pills: DiagnosticPill[];
  quantitative_metrics: QuantitativeMetrics;
  top_ai_findings: TopAiFinding[];
  findings_requiring_attention: AttentionCard[];
  lead_wise_review: LeadWiseReview[];
  clinical_correlations: ClinicalCorrelation[];
  previous_ecg_comparison: {
    prior_ecg_date: string | null;
    comparison_note: string;
  };
  red_flag_review: {
    status: string;
    summary: string;
  };
  patient_communication_summary: string;
  patient_explanation: string;
  warning_signs: string[];
  generated_by?: string;
}

/** Final output contract — mirrors FastAPI response */
export interface EcgAnalysisResult {
  quality_status: "accepted" | "needs_reupload";
  ai_summary: string;
  findings: { label: string; detail: string; probability?: number; affected_leads?: string[] }[];
  confidence: number;
  abnormal_leads: string[];
  urgency: Urgency;
  patient_explanation: string;
  warning_signs: string[];
  model_version: string;
  clinical_report?: ClinicalReport;
}

export const URGENCY_LABEL: Record<Urgency, string> = {
  routine: "Routine",
  review_soon: "Review Soon",
  urgent: "Urgent Review",
};

export const URGENCY_COLOR: Record<Urgency, string> = {
  routine: "bg-routine/12 text-routine border-routine/20",
  review_soon: "bg-soon/12 text-soon border-soon/20",
  urgent: "bg-urgent/10 text-urgent border-urgent/20",
};
