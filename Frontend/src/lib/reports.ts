import { jsPDF } from "jspdf";
import { toPng } from "html-to-image";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { assessmentApi, apiRequest } from "@/lib/api-client";
import { URGENCY_LABEL, type Urgency, type ClinicalReport } from "./mock-ai";
import { ReportView } from "@/components/report-view";

export interface ReportBundle {
  report: { id: string; report_code: string; generated_at: string; report_status: string } | null;
  assessment: any;
  ecg: any;
  ai: any;
  validation: any;
  doctor: { display_name: string; specialty: string | null } | null;
  company: { name: string } | null;
  imageUrl: string | null;
  digitisedPlotUrl?: string | null;
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
    try { reportDetail = await apiRequest(`/reports/${assessmentId}`); } catch { reportDetail = null; }

    const assessment = await assessmentApi.get(assessmentId);
    let ecgData: any = null;
    try { ecgData = await apiRequest(`/ecg/${assessmentId}`); } catch { ecgData = null; }

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

    const company = { name: reportDetail?.company_name || assessment.company_name || "—" };

    const rawPlot = ecgData?.ai_result?.plot_png_base64 || reportDetail?.plot_png_base64 || null;
    const digitisedPlotUrl = rawPlot ? (rawPlot.startsWith("data:") ? rawPlot : `data:image/png;base64,${rawPlot}`) : null;

    const ai = ecgData?.ai_result || (reportDetail?.ai_summary ? {
      ai_summary: reportDetail.ai_summary,
      findings: reportDetail.findings || [],
      abnormal_leads: reportDetail.abnormal_leads || [],
      confidence_json: reportDetail.confidence_json || {},
      urgency: reportDetail.urgency || "routine",
      patient_explanation: reportDetail.patient_explanation || "",
      warning_signs: reportDetail.warning_signs || [],
      clinical_report: reportDetail.clinical_report || null,
      plot_png_base64: rawPlot,
      digitised_leads: ecgData?.ai_result?.digitised_leads || reportDetail?.digitised_leads || null,
      reconstructed_leads: ecgData?.ai_result?.reconstructed_leads || reportDetail?.reconstructed_leads || null,
      lead_quality: ecgData?.ai_result?.lead_quality || reportDetail?.lead_quality || null,
      warnings: ecgData?.ai_result?.warnings || reportDetail?.warnings || [],
    } : null);

    return {
      report, assessment,
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
      doctor, company,
      imageUrl: reportDetail?.image_url || ecgData?.image_url || null,
      digitisedPlotUrl,
    };
  } catch (err: any) {
    throw new Error(err.message || "Failed to load report data");
  }
}

async function capturePageToPng(el: HTMLElement): Promise<string> {
  const opts = {
    quality: 0.98,
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    cacheBust: true,
  };
  try {
    return await toPng(el, opts);
  } catch (err) {
    console.warn("Failed standard html-to-image capture, retrying with skipFonts: true", err);
    return await toPng(el, { ...opts, skipFonts: true });
  }
}

export async function downloadReportPdf(b: ReportBundle) {
  // Ensure custom web fonts are fully loaded before capturing
  if (typeof document !== "undefined" && document.fonts) {
    try {
      await document.fonts.ready;
    } catch {}
  }

  let cleanup: (() => void) | null = null;
  let p1 = document.getElementById("qardix-report-page-1") as HTMLElement | null;
  let p2 = document.getElementById("qardix-report-page-2") as HTMLElement | null;

  // If report pages are not mounted in the visible DOM (e.g. download clicked from list view)
  if (!p1 || !p2) {
    const container = document.createElement("div");
    container.id = "qardix-pdf-offscreen-mount";
    container.style.position = "fixed";
    container.style.left = "-9999px";
    container.style.top = "0";
    container.style.width = "900px";
    container.style.background = "#ffffff";
    container.style.zIndex = "-9999";
    container.style.pointerEvents = "none";
    document.body.appendChild(container);

    const root = createRoot(container);
    root.render(createElement(ReportView, { b }));

    // Allow DOM to layout and images to initialize
    await new Promise((resolve) => setTimeout(resolve, 500));

    p1 = container.querySelector("#qardix-report-page-1") as HTMLElement | null;
    p2 = container.querySelector("#qardix-report-page-2") as HTMLElement | null;

    cleanup = () => {
      try {
        root.unmount();
        container.remove();
      } catch {}
    };
  }

  try {
    if (!p1 || !p2) {
      throw new Error("Unable to locate or render report pages for PDF generation.");
    }

    const [img1, img2] = await Promise.all([
      capturePageToPng(p1),
      capturePageToPng(p2),
    ]);

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
      compress: true,
    });

    const pdfW = doc.internal.pageSize.getWidth();   // 595.28 pt
    const pdfH = doc.internal.pageSize.getHeight();  // 841.89 pt
    const marginX = 14;
    const marginY = 14;
    const availW = pdfW - marginX * 2;
    const availH = pdfH - marginY * 2;

    const addFitPage = (imgData: string, el: HTMLElement) => {
      const elW = el.offsetWidth || 1;
      const elH = el.offsetHeight || 1;
      const aspect = elH / elW;

      let renderW = availW;
      let renderH = availW * aspect;

      if (renderH > availH) {
        renderH = availH;
        renderW = availH / aspect;
      }

      const x = marginX + (availW - renderW) / 2;
      const y = marginY + (availH - renderH) / 2;

      doc.addImage(imgData, "PNG", x, y, renderW, renderH, undefined, "FAST");
    };

    // Render Page 1
    addFitPage(img1, p1);

    // Render Page 2
    doc.addPage();
    addFitPage(img2, p2);

    const safeFilename = `${(b.report?.report_code || "qardix-report").replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
    doc.save(safeFilename);
  } finally {
    if (cleanup) {
      cleanup();
    }
  }
}



