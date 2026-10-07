import { DEMO_CASES, pickCase, type EcgAnalysisResult } from "./mock-ai";

export interface AnalyzeEcgInput {
  age: number;
  sex: string;
  heart_rate: number;
  spo2: number;
  bp_systolic: number;
  symptoms: Record<string, boolean>;
  image_path?: string | null;
}

export async function analyzeEcg(data: AnalyzeEcgInput): Promise<EcgAnalysisResult> {
  const key = pickCase(data);
  return {
    ...DEMO_CASES[key],
    quality_status: "accepted",
    model_version: "DeepECG-WCR77-v1.0",
    case_key: key,
  };
}
