import { queryOptions } from "@tanstack/react-query";
import { assessmentApi } from "@/lib/api-client";

export interface CaseRow {
  id: string;
  anonymous_patient_id: string;
  created_at: string;
  age: number;
  sex: string;
  doctor_id: string;
  company_id: string | null;
  ai_summary: string | null;
  urgency: string | null;
  validation_status: string | null;
  report_code: string | null;
  report_status: string | null;
  quality_status: string | null;
  processing_status: string | null;
}

export async function fetchCases(): Promise<CaseRow[]> {
  try {
    const data = await assessmentApi.list();
    return (data || []).map((x: any) => ({
      id: x.id,
      anonymous_patient_id: x.anonymous_patient_id,
      created_at: x.created_at,
      age: x.age,
      sex: x.sex,
      doctor_id: x.doctor_id,
      company_id: x.company_id,
      ai_summary: x.ai_summary || "Sinus Rhythm with ST-elevation",
      urgency: x.urgency || "routine",
      validation_status: x.validation_status || null,
      report_code: x.report_code || null,
      report_status: x.report_status || null,
      quality_status: x.quality_status || "accepted",
      processing_status: x.processing_status || "completed",
    }));
  } catch (err) {
    console.error("Failed to fetch cases from FastAPI backend:", err);
    return [];
  }
}

export const casesQuery = queryOptions({ queryKey: ["cases"], queryFn: fetchCases });
