import type { EcgAnalysisResult } from "./mock-ai";

export interface AnalyzeEcgInput {
  age: number;
  sex: string;
  heart_rate: number;
  spo2: number;
  bp_systolic: number;
  symptoms: Record<string, boolean>;
  image_path?: string | null;
}

/** Deprecated: ECG analysis is processed via FastAPI backend /api/v1/ecg/upload */
export async function analyzeEcg(_data: AnalyzeEcgInput): Promise<Partial<EcgAnalysisResult>> {
  throw new Error("Local mock analysis is deprecated. ECG analysis is processed via FastAPI backend.");
}

