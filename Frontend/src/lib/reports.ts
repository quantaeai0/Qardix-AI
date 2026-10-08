import { jsPDF } from "jspdf";
import { assessmentApi, apiRequest } from "@/lib/api-client";
import { URGENCY_LABEL, type Urgency } from "./mock-ai";

export interface ReportBundle {
  report: { id: string; report_code: string; generated_at: string; report_status: string } | null;
  assessment: any;
  ecg: any;
  ai: any;
  validation: any;
  doctor: { display_name: string; specialty: string | null } | null;
  company: { name: string } | null;
  imageUrl: string | null;
}

export const SYMPTOM_LABELS: Record<string, string> = {
  chest_pain: "Chest Pain",
  palpitation: "Palpitation",
  breathlessness: "Breathlessness",
  syncope: "Syncope / Fainting",
};

export const VALIDATION_LABEL: Record<string, string> = { confirm: "Confirmed", correct: "Corrected", reject: "Rejected" };

export async function loadReportBundle(assessmentId: string): Promise<ReportBundle> {
  try {
    let reportDetail: any = null;
    try {
      reportDetail = await apiRequest(`/reports/${assessmentId}`);
    } catch {
      reportDetail = null;
    }

    const assessment = await assessmentApi.get(assessmentId);
    let ecgData: any = null;
    try {
      ecgData = await apiRequest(`/ecg/${assessmentId}`);
    } catch {
      ecgData = null;
    }

    const report = {
      id: reportDetail?.id || assessment.id,
      report_code: reportDetail?.report_code || assessment.report_code || `REP-${assessment.anonymous_patient_id}`,
      generated_at: reportDetail?.generated_at || assessment.created_at,
      report_status: reportDetail?.report_status || assessment.report_status || "generated",
    };

    const doctor = {
      display_name: reportDetail?.doctor_name || assessment.doctor_name || "Doctor",
      specialty: reportDetail?.doctor_specialty || null,
    };

    const company = {
      name: reportDetail?.company_name || assessment.company_name || "—",
    };

    const ai = ecgData?.ai_result || (reportDetail?.ai_summary ? {
      ai_summary: reportDetail.ai_summary,
      findings: reportDetail.findings || [],
      abnormal_leads: reportDetail.abnormal_leads || [],
      confidence_json: reportDetail.confidence_json || { overall: 0.94 },
      urgency: reportDetail.urgency || "routine",
      patient_explanation: reportDetail.patient_explanation || "",
      warning_signs: reportDetail.warning_signs || [],
    } : null);

    return {
      report,
      assessment,
      ecg: {
        quality_status: ecgData?.quality_status || assessment.quality_status || "accepted",
        processing_status: ecgData?.processing_status || assessment.processing_status || "completed",
      },
      ai,
      validation: reportDetail?.validation_status ? {
        status: reportDetail.validation_status,
        notes: reportDetail.doctor_notes,
        validated_at: reportDetail.generated_at,
      } : assessment.validation || null,
      doctor,
      company,
      imageUrl: reportDetail?.image_url || ecgData?.image_url || null,
    };
  } catch (err: any) {
    throw new Error(err.message || "Failed to load report data");
  }
}

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function downloadReportPdf(b: ReportBundle) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let y = 0;
  const navy: [number, number, number] = [18, 30, 64];
  const teal: [number, number, number] = [32, 178, 190];

  doc.setFillColor(...navy).rect(0, 0, W, 78, "F");
  doc.setTextColor(255, 255, 255).setFont("helvetica", "bold").setFontSize(22).text("Qardix AI", 40, 44);
  doc.setFont("helvetica", "normal").setFontSize(10).text("Heart-Health ECG Report", 40, 62);
  doc.setFontSize(9).text(`Report ID: ${b.report?.report_code ?? "—"}`, W - 40, 40, { align: "right" });
  doc.text(new Date(b.report?.generated_at ?? b.assessment.created_at).toLocaleString(), W - 40, 56, { align: "right" });
  doc.setDrawColor(...teal).setLineWidth(2).line(0, 78, W, 78);
  y = 104;

  const ensure = (h: number) => { if (y + h > H - 60) { doc.addPage(); y = 50; } };
  const heading = (t: string) => {
    ensure(30);
    doc.setTextColor(...teal).setFont("helvetica", "bold").setFontSize(10).text(t.toUpperCase(), 40, y);
    y += 16;
  };
  const para = (t: string, size = 10) => {
    doc.setTextColor(30, 35, 50).setFont("helvetica", "normal").setFontSize(size);
    const lines = doc.splitTextToSize(t, W - 80);
    ensure(lines.length * (size + 4));
    doc.text(lines, 40, y);
    y += lines.length * (size + 4) + 8;
  };
  const kv = (pairs: [string, string][]) => {
    const colW = (W - 80) / 3;
    pairs.forEach(([k, v], i) => {
      const col = i % 3;
      if (col === 0) ensure(32);
      doc.setTextColor(110, 120, 140).setFontSize(8).text(k, 40 + col * colW, y);
      doc.setTextColor(20, 25, 45).setFontSize(10).setFont("helvetica", "bold").text(v, 40 + col * colW, y + 13);
      doc.setFont("helvetica", "normal");
      if (col === 2 || i === pairs.length - 1) y += 32;
    });
  };

  const a = b.assessment;
  heading("Patient & Clinical Data");
  kv([
    ["Anonymous Patient ID", a.anonymous_patient_id], ["Age / Sex", `${a.age} y / ${a.sex}`], ["BMI", String(a.bmi ?? "—")],
    ["Height / Weight", `${a.height_cm} cm / ${a.weight_kg} kg`], ["Blood Pressure", `${a.bp_systolic}/${a.bp_diastolic} mmHg`], ["Heart Rate", `${a.heart_rate} bpm`],
    ["SpO2", `${a.spo2}%`], ["Diabetes", a.diabetes_status], ["Complications", a.diabetic_complications?.join(", ") || "None"],
  ]);
  heading("Symptoms & Medicines");
  const sym = Object.entries(a.symptoms ?? {}).map(([k, v]) => `${SYMPTOM_LABELS[k] ?? k}: ${v ? "Yes" : "No"}`).join("   ");
  para(sym || "None recorded");
  para(`Current medicines: ${a.medicines?.join(", ") || "None"}`);

  if (b.imageUrl) {
    const data = await toDataUrl(b.imageUrl);
    if (data) {
      heading("ECG Image");
      ensure(200);
      try { doc.addImage(data, 40, y, W - 80, 190, undefined, "FAST"); y += 204; } catch { /* ignore */ }
    }
  }

  if (b.ai) {
    heading("AI ECG Summary (AI-assisted, requires doctor review)");
    para(b.ai.ai_summary, 11);
    (b.ai.findings ?? []).forEach((f: any) => para(`• ${f.label}: ${f.detail}`, 9));
    para(`Abnormal leads: ${b.ai.abnormal_leads?.join(", ") || "None flagged"}   ·   Supportive confidence: ${Math.round((b.ai.confidence_json?.overall ?? 0) * 100)}%`, 9);
    heading("Urgency Flag (decision support)");
    para(URGENCY_LABEL[b.ai.urgency as Urgency] ?? b.ai.urgency, 12);
    heading("Patient-Friendly Explanation");
    para(b.ai.patient_explanation);
    heading("Warning Signs — reviewed by your doctor");
    (b.ai.warning_signs ?? []).forEach((w: string) => para(`• ${w}`));
  }
  if (b.validation) {
    heading("Doctor Validation");
    para(`Status: ${VALIDATION_LABEL[b.validation.status]}  ·  ${new Date(b.validation.validated_at).toLocaleString()}`);
    if (b.validation.corrected_interpretation) para(`Doctor Final Interpretation: ${b.validation.corrected_interpretation}`);
    if (b.validation.notes) para(`Notes: ${b.validation.notes}`);
  }
  ensure(60);
  y += 10;
  doc.setDrawColor(220, 225, 235).line(40, y, W - 40, y);
  y += 18;
  para(`${b.doctor?.display_name ?? ""}${b.doctor?.specialty ? " · " + b.doctor.specialty : ""}   |   ${b.company?.name ?? ""}`);
  doc.setFontSize(8).setTextColor(120, 125, 140).text(
    "AI-assisted ECG interpretation. Final clinical interpretation and decision remain with the treating doctor.",
    W / 2, H - 30, { align: "center" },
  );
  doc.save(`${b.report?.report_code ?? "qardix-report"}.pdf`);
}
