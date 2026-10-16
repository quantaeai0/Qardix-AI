import { jsPDF } from "jspdf";
import { assessmentApi, apiRequest } from "@/lib/api-client";
import { URGENCY_LABEL, type Urgency, type ClinicalReport } from "./mock-ai";

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

    const ai = ecgData?.ai_result || (reportDetail?.ai_summary ? {
      ai_summary: reportDetail.ai_summary,
      findings: reportDetail.findings || [],
      abnormal_leads: reportDetail.abnormal_leads || [],
      confidence_json: reportDetail.confidence_json || {},
      urgency: reportDetail.urgency || "routine",
      patient_explanation: reportDetail.patient_explanation || "",
      warning_signs: reportDetail.warning_signs || [],
      clinical_report: reportDetail.clinical_report || null,
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
    };
  } catch (err: any) {
    throw new Error(err.message || "Failed to load report data");
  }
}

async function toDataUrl(url: string): Promise<string | null> {
  try {
    if (url.startsWith("data:")) return url;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = () => res(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}


// ── Color palette (matches sample PDF) ────────────────────────────────────────
const NAVY: [number, number, number] = [18, 30, 64];        // #121E40
const TEAL: [number, number, number] = [32, 178, 190];      // #20B2BE
const AMBER: [number, number, number] = [217, 119, 6];      // #D97706
const URGENT_RED: [number, number, number] = [220, 38, 38]; // #DC2626
const GREEN: [number, number, number] = [22, 163, 74];      // #16A34A
const SLATE_BG: [number, number, number] = [248, 250, 252]; // #F8FAFC
const BORDER_COLOR: [number, number, number] = [226, 232, 240]; // #E2E8F0
const DARK: [number, number, number] = [18, 30, 64];        // #121E40
const MID: [number, number, number] = [100, 116, 139];      // #64748B
const LIGHT_TEAL_BG: [number, number, number] = [230, 247, 248]; // #E6F7F8
const TEAL_TEXT: [number, number, number] = [0, 122, 135];  // #007A87

export async function downloadReportPdf(b: ReportBundle) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MARGIN = 36;
  const CONTENT_W = 523; // exactly W - MARGIN * 2 (rounded to integer)
  const RIGHT_EDGE = MARGIN + CONTENT_W;

  const cr: ClinicalReport | null = b.ai?.clinical_report ?? null;
  const a = b.assessment;
  const genDateStr = new Date(b.report?.generated_at ?? a.created_at).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  // ── Common Helpers ──────────────────────────────────────────────────────────
  const drawHeader = (title: string, subtitle: string, isPage2 = false) => {
    doc.setFillColor(...NAVY).rect(0, 0, W, 62, "F");
    doc.setDrawColor(...TEAL).setLineWidth(2).line(0, 62, W, 62);

    doc.setTextColor(255, 255, 255).setFont("helvetica", "bold").setFontSize(17).text("QARDIX AI", MARGIN, 32);
    doc.setTextColor(180, 230, 240).setFont("helvetica", "normal").setFontSize(8.5).text(subtitle, MARGIN, 48);

    doc.setFillColor(...AMBER).roundedRect(W / 2 - 58, 8, 116, 14, 3, 3, "F");
    doc.setTextColor(80, 40, 0).setFont("helvetica", "bold").setFontSize(6.5)
       .text("SAMPLE — NOT FOR CLINICAL USE", W / 2, 17.5, { align: "center" });

    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(203, 213, 225);
    if (!isPage2) {
      doc.text(`Report ID: ${b.report?.report_code ?? "—"}`, RIGHT_EDGE, 24, { align: "right" })
         .text(`Assessment ID: ${a.anonymous_patient_id}`, RIGHT_EDGE, 36, { align: "right" })
         .text(`Generated: ${genDateStr}`, RIGHT_EDGE, 48, { align: "right" });
    } else {
      doc.text(`Patient: ${a.anonymous_patient_id}`, RIGHT_EDGE, 28, { align: "right" })
         .text(`Report: ${b.report?.report_code ?? "—"}`, RIGHT_EDGE, 42, { align: "right" });
    }
  };

  const drawFooter = (pageNumber: number) => {
    doc.setDrawColor(...BORDER_COLOR).setLineWidth(0.5).line(MARGIN, H - 28, RIGHT_EDGE, H - 28);
    doc.setTextColor(...MID).setFont("helvetica", "normal").setFontSize(7);
    doc.text("Powered by QUANTAE TECHNOLOGY", MARGIN, H - 15);
    doc.text(`Qardix AI | Doctor Report | Page ${pageNumber} of 2`, RIGHT_EDGE, H - 15, { align: "right" });
  };

  const drawPill = (label: string, tone: "normal" | "warning" | "urgent" | "navy", x: number, yy: number): number => {
    const colors: Record<string, { bg: [number, number, number]; text: [number, number, number] }> = {
      normal: { bg: [220, 252, 231], text: [22, 101, 52] },
      warning: { bg: [254, 243, 199], text: [180, 83, 9] },
      urgent: { bg: [254, 226, 226], text: [185, 28, 28] },
      navy: { bg: [238, 242, 255], text: [49, 46, 129] },
    };
    const c = colors[tone] || colors.normal;
    const w = doc.getStringUnitWidth(label) * 7.5 / doc.internal.scaleFactor + 12;
    doc.setFillColor(...c.bg).roundedRect(x, yy - 8, w, 12, 3, 3, "F");
    doc.setTextColor(...c.text).setFont("helvetica", "bold").setFontSize(7).text(label, x + 6, yy);
    return w + 5;
  };

  const drawStatusPill = (status: string, x: number, yy: number) => {
    const toneMap: Record<string, "normal" | "warning" | "urgent" | "navy"> = {
      Normal: "normal", Review: "navy", Attention: "urgent", Correlate: "warning",
    };
    drawPill(status, toneMap[status] || "navy", x, yy);
  };

  const drawSectionHeader = (title: string, yPos: number) => {
    doc.setTextColor(...TEAL).setFont("helvetica", "bold").setFontSize(7.5).text(title, MARGIN, yPos);
  };

  // ═════════════════════════════════════════════════════════════════════════════
  // PAGE 1
  // ═════════════════════════════════════════════════════════════════════════════
  drawHeader("QARDIX AI", "Doctor Clinical Intelligence Report", false);

  // 1. Hero Box ("ECG Intelligence at a Glance")
  const heroY = 70;
  const heroH = 96;
  doc.setFillColor(...SLATE_BG).roundedRect(MARGIN, heroY, CONTENT_W, heroH, 5, 5, "F");
  doc.setDrawColor(...BORDER_COLOR).setLineWidth(0.75).roundedRect(MARGIN, heroY, CONTENT_W, heroH, 5, 5, "S");

  // Left Content of Hero Box
  doc.setTextColor(...DARK).setFont("helvetica", "bold").setFontSize(10.5).text("ECG Intelligence at a Glance", MARGIN + 12, heroY + 14);

  const symList: string[] = [];
  if (a.symptoms?.chest_pain) symList.push("Chest pain present");
  if (a.symptoms?.breathlessness) symList.push("Breathlessness present");
  if (a.symptoms?.palpitation) symList.push("Palpitations present");
  if (a.symptoms?.syncope) symList.push("Syncope history");
  const symStr = symList.length ? symList.slice(0, 2).join(" | ") : "No acute cardiac symptoms reported";

  const subLine = `${a.age}-year-old ${String(a.sex).toLowerCase()} | ${a.diabetes_status || "Non-diabetic"} | BP ${a.bp_systolic}/${a.bp_diastolic} mmHg | ${symStr}`;
  doc.setTextColor(...MID).setFont("helvetica", "normal").setFontSize(7).text(subLine, MARGIN + 12, heroY + 25);

  // Diagnostic Pills row (capped at width 310 to never hit Priority Box)
  let pillX = MARGIN + 12;
  const pillY = heroY + 38;
  const pills = cr?.diagnostic_pills?.length ? cr.diagnostic_pills : [{ label: "Sinus Rhythm", tone: "normal" }];
  pills.slice(0, 3).forEach((p) => {
    if (pillX < MARGIN + 270) {
      pillX += drawPill(p.label, p.tone as any, pillX, pillY);
    }
  });

  // Impression narrative
  const impression = cr?.ecg_impression || b.ai?.ai_summary || "ECG tracing processed. Physician review and clinical correlation advised.";
  doc.setTextColor(...DARK).setFont("helvetica", "bold").setFontSize(7.5).text("AI ECG impression: ", MARGIN + 12, heroY + 54);
  const impWidth = 315;
  const impLines = doc.splitTextToSize(impression, impWidth);
  doc.setFont("helvetica", "normal").setFontSize(7.5);
  impLines.slice(0, 2).forEach((l: string, i: number) => {
    doc.text(l, MARGIN + 12, heroY + 64 + i * 10);
  });

  // Affected leads & confidence
  const affLeads = cr?.top_ai_findings?.[0]?.lead_region || (b.ai?.abnormal_leads?.length ? b.ai.abnormal_leads.join(", ") : "Global");
  const confText = cr?.overall_confidence || (b.ai?.confidence_json?.overall ? (b.ai.confidence_json.overall >= 0.8 ? "High" : "Moderate-High") : "Moderate-High");
  doc.setTextColor(...MID).setFont("helvetica", "normal").setFontSize(7)
     .text(`Affected leads: ${affLeads}  |  Overall AI confidence: ${confText}`, MARGIN + 12, heroY + 89);

  // Right Priority Box in Hero Card
  const priorityW = 175;
  const priorityX = RIGHT_EDGE - priorityW - 6;
  const priorityY = heroY + 6;
  const priorityH = heroH - 12;
  const priorityLevel = cr?.clinical_priority || (b.ai?.urgency === "urgent" ? "URGENT" : b.ai?.urgency === "review_soon" ? "REVIEW_SOON" : "ROUTINE");
  const prioColor: [number, number, number] = priorityLevel === "URGENT" ? URGENT_RED : priorityLevel === "REVIEW_SOON" ? AMBER : GREEN;

  doc.setFillColor(...prioColor).roundedRect(priorityX, priorityY, priorityW, priorityH, 4, 4, "F");
  doc.setTextColor(255, 255, 255).setFont("helvetica", "bold").setFontSize(6.5)
     .text("CLINICAL REVIEW PRIORITY", priorityX + priorityW / 2, priorityY + 14, { align: "center" });
  doc.setFontSize(13).text(priorityLevel.replace("_", " "), priorityX + priorityW / 2, priorityY + 31, { align: "center" });

  const prioReason = cr?.clinical_priority_reason || `ECG findings requiring physician confirmation. Not an autonomous diagnosis.`;
  const reasonLines = doc.splitTextToSize(`Reason: ${prioReason}`, priorityW - 16);
  doc.setFont("helvetica", "normal").setFontSize(6.5);
  reasonLines.slice(0, 3).forEach((line: string, i: number) => {
    doc.text(line, priorityX + priorityW / 2, priorityY + 45 + i * 9, { align: "center" });
  });

  // 2. 6-Metric Bar
  const metricsY = 172;
  const metricsH = 38;
  const m = cr?.quantitative_metrics;
  const metricTiles = [
    { label: "HEART RATE", value: `${m?.heart_rate_bpm ?? a.heart_rate ?? 75} bpm` },
    { label: "PR INTERVAL", value: `${m?.pr_interval_ms ?? 168} ms` },
    { label: "QRS DURATION", value: `${m?.qrs_duration_ms ?? 96} ms` },
    { label: "QT / QTC", value: `${m?.qt_ms ?? 382} / ${m?.qtc_ms ?? 446} ms` },
    { label: "ELECTRICAL AXIS", value: (m?.electrical_axis_deg ?? "+18 deg").replace("°", " deg") },
    { label: "ECG QUALITY", value: m?.ecg_quality_text ?? "Good - 92%" },
  ];
  const tw = CONTENT_W / 6;
  metricTiles.forEach((tile, i) => {
    const tx = MARGIN + i * tw;
    doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 250 : 255, 252).rect(tx, metricsY, tw, metricsH, "F");
    doc.setDrawColor(...BORDER_COLOR).setLineWidth(0.5).rect(tx, metricsY, tw, metricsH, "S");
    doc.setTextColor(...MID).setFont("helvetica", "bold").setFontSize(6).text(tile.label, tx + tw / 2, metricsY + 11, { align: "center" });
    doc.setTextColor(...NAVY).setFont("helvetica", "bold").setFontSize(9.5).text(tile.value, tx + tw / 2, metricsY + 27, { align: "center" });
  });

  // 3. ECG Waveform Preview
  const ecgBoxY = 216;
  drawSectionHeader("ECG Preview", ecgBoxY);
  const ecgCardY = ecgBoxY + 8;
  const ecgCardH = 88;
  doc.setFillColor(...SLATE_BG).roundedRect(MARGIN, ecgCardY, CONTENT_W, ecgCardH, 4, 4, "F");
  doc.setDrawColor(...BORDER_COLOR).setLineWidth(0.5).roundedRect(MARGIN, ecgCardY, CONTENT_W, ecgCardH, 4, 4, "S");

  let imageDrawn = false;
  if (b.imageUrl) {
    const imgData = await toDataUrl(b.imageUrl);
    if (imgData) {
      try {
        doc.addImage(imgData, "PNG", MARGIN + 4, ecgCardY + 4, CONTENT_W - 8, ecgCardH - 18, undefined, "FAST");
        imageDrawn = true;
      } catch {}
    }
  }

  if (!imageDrawn) {
    // Draw clean 3-lead grid waveform preview matching reference sample
    doc.setDrawColor(235, 240, 245).setLineWidth(0.5);
    for (let gy = ecgCardY + 6; gy < ecgCardY + ecgCardH - 16; gy += 12) {
      doc.line(MARGIN + 4, gy, RIGHT_EDGE - 4, gy);
    }
    const leads = ["II", "V1", "V5"];
    leads.forEach((ld, idx) => {
      const ly = ecgCardY + 16 + idx * 22;
      doc.setTextColor(...MID).setFont("helvetica", "bold").setFontSize(7).text(ld, MARGIN + 10, ly + 3);
      doc.setDrawColor(...NAVY).setLineWidth(0.75);
      let lx = MARGIN + 32;
      doc.line(lx, ly, lx + 25, ly);
      lx += 25;
      doc.line(lx, ly, lx + 6, ly - 4);
      doc.line(lx + 6, ly - 4, lx + 12, ly);
      lx += 12;
      doc.line(lx, ly, lx + 15, ly);
      lx += 15;
      doc.line(lx, ly, lx + 3, ly + 2);
      doc.line(lx + 3, ly + 2, lx + 8, ly - 14);
      doc.line(lx + 8, ly - 14, lx + 13, ly + 6);
      doc.line(lx + 13, ly + 6, lx + 16, ly);
      lx += 16;
      doc.line(lx, ly, lx + 12, ly);
      lx += 12;
      doc.line(lx, ly, lx + 8, ly - 5);
      doc.line(lx + 8, ly - 5, lx + 16, ly);
      lx += 16;
      doc.line(lx, ly, RIGHT_EDGE - 12, ly);
    });
  }
  doc.setTextColor(...MID).setFont("helvetica", "italic").setFontSize(6.5)
     .text("Illustrative preview. The original uploaded 12-lead ECG tracing should remain available to the doctor for verification.", MARGIN + 6, ecgCardY + ecgCardH - 4);

  // 4. Patient & Clinical Snapshot
  const snapY = 320;
  drawSectionHeader("Patient & Clinical Snapshot", snapY);
  const snapCardY = snapY + 8;
  const snapCardH = 68;
  doc.setFillColor(...SLATE_BG).roundedRect(MARGIN, snapCardY, CONTENT_W, snapCardH, 4, 4, "F");
  doc.setDrawColor(...BORDER_COLOR).setLineWidth(0.5).roundedRect(MARGIN, snapCardY, CONTENT_W, snapCardH, 4, 4, "S");

  const colW = CONTENT_W / 3;
  // Col 1: Patient
  doc.setTextColor(...MID).setFont("helvetica", "bold").setFontSize(7).text("Patient", MARGIN + 8, snapCardY + 12);
  doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(...DARK);
  doc.text(`ID: ${a.anonymous_patient_id}`, MARGIN + 8, snapCardY + 24);
  doc.text(`Age/Sex: ${a.age} / ${a.sex}`, MARGIN + 8, snapCardY + 36);
  doc.text(`Height: ${a.height_cm} cm | Weight: ${a.weight_kg} kg`, MARGIN + 8, snapCardY + 48);
  doc.text(`BMI: ${a.bmi ?? "—"} kg/m²`, MARGIN + 8, snapCardY + 60);

  // Col 2: Vitals
  doc.setTextColor(...MID).setFont("helvetica", "bold").setFontSize(7).text("Vitals", MARGIN + colW + 8, snapCardY + 12);
  doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(...DARK);
  doc.text(`BP: ${a.bp_systolic}/${a.bp_diastolic} mmHg`, MARGIN + colW + 8, snapCardY + 24);
  doc.text(`Heart Rate: ${a.heart_rate} bpm`, MARGIN + colW + 8, snapCardY + 36);
  doc.text(`SpO2: ${a.spo2}%`, MARGIN + colW + 8, snapCardY + 48);

  // Col 3: Clinical Context
  doc.setTextColor(...MID).setFont("helvetica", "bold").setFontSize(7).text("Clinical Context", MARGIN + colW * 2 + 8, snapCardY + 12);
  doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(...DARK);
  doc.text(`Diabetes: ${a.diabetes_status || "None"}`, MARGIN + colW * 2 + 8, snapCardY + 24);
  doc.text(`Chest Pain: ${a.symptoms?.chest_pain ? "Yes" : "No"} | Palpitations: ${a.symptoms?.palpitation ? "Yes" : "No"}`, MARGIN + colW * 2 + 8, snapCardY + 36);
  doc.text(`Breathlessness: ${a.symptoms?.breathlessness ? "Yes" : "No"} | Syncope: ${a.symptoms?.syncope ? "Yes" : "No"}`, MARGIN + colW * 2 + 8, snapCardY + 48);

  // 5. Top AI Findings Table
  const findY = 404;
  drawSectionHeader("Top AI Findings", findY);
  const findHeaderY = findY + 8;
  const findCols = [28, 160, 95, 80, 160];
  const findHeaders = ["Priority", "AI Finding", "Lead / Region", "Confidence", "Doctor Review"];

  doc.setFillColor(...LIGHT_TEAL_BG).rect(MARGIN, findHeaderY, CONTENT_W, 14, "F");
  let fx = MARGIN;
  findHeaders.forEach((h, i) => {
    doc.setTextColor(...TEAL_TEXT).setFont("helvetica", "bold").setFontSize(6.5).text(h, fx + 4, findHeaderY + 10);
    fx += findCols[i];
  });

  const findingsList = cr?.top_ai_findings?.length
    ? cr.top_ai_findings.slice(0, 3)
    : (b.ai?.findings || []).slice(0, 3).map((f: any, i: number) => ({
        priority: i + 1,
        ai_finding: f.label,
        lead_region: f.affected_leads?.join(", ") || "Global",
        confidence: f.probability >= 0.8 ? "High" : "Moderate-High",
        doctor_review: i === 0 ? "Correlate clinically" : "Confirm on tracing",
      }));

  let rowY = findHeaderY + 14;
  findingsList.forEach((row: any, ri: number) => {
    doc.setFillColor(ri % 2 === 0 ? 255 : 248, ri % 2 === 0 ? 255 : 250, 252).rect(MARGIN, rowY, CONTENT_W, 16, "F");
    doc.setDrawColor(...BORDER_COLOR).rect(MARGIN, rowY, CONTENT_W, 16, "S");
    let rx = MARGIN;
    const cells = [String(row.priority), row.ai_finding, row.lead_region, row.confidence, row.doctor_review];
    cells.forEach((cell, ci) => {
      doc.setTextColor(...DARK).setFont("helvetica", ci === 0 ? "bold" : "normal").setFontSize(7.5).text(cell, rx + 4, rowY + 11);
      rx += findCols[ci];
    });
    rowY += 16;
  });

  // 6. Findings Requiring Attention (2 Side-by-Side Cards)
  const attY = 482;
  drawSectionHeader("Findings Requiring Attention", attY);
  const attCards = cr?.findings_requiring_attention?.length
    ? cr.findings_requiring_attention.slice(0, 2)
    : [
        {
          title: "1. Inferior ST-T Changes",
          description: "AI identified possible ST-T morphology changes involving leads II, III and aVF. Review in the context of symptoms, previous ECG, medications and other relevant investigations.",
        },
        {
          title: "2. Possible LVH Voltage Pattern",
          description: "Voltage pattern may be compatible with left ventricular hypertrophy. Correlate with blood pressure history and other clinical evaluation if indicated.",
        },
      ];

  const cardW = 257;
  const cardH = 58;
  attCards.forEach((c: any, i: number) => {
    const cx = MARGIN + i * 266;
    doc.setFillColor(255, 251, 235).roundedRect(cx, attY + 8, cardW, cardH, 4, 4, "F");
    doc.setDrawColor(...AMBER).setLineWidth(0.75).roundedRect(cx, attY + 8, cardW, cardH, 4, 4, "S");
    doc.setTextColor(180, 83, 9).setFont("helvetica", "bold").setFontSize(7.5).text(c.title, cx + 8, attY + 20);

    const descLines = doc.splitTextToSize(c.description, cardW - 16);
    doc.setTextColor(120, 53, 15).setFont("helvetica", "normal").setFontSize(6.5);
    descLines.slice(0, 3).forEach((line: string, li: number) => {
      doc.text(line, cx + 8, attY + 31 + li * 9);
    });
  });

  // Page 1 Footer
  drawFooter(1);

  // ═════════════════════════════════════════════════════════════════════════════
  // PAGE 2
  // ═════════════════════════════════════════════════════════════════════════════
  doc.addPage();
  drawHeader("QARDIX AI", "Clinical Review & Doctor Validation", true);

  // 1. Lead-wise Review Table
  const leadY = 70;
  drawSectionHeader("Lead-wise Review", leadY);
  const leadHeaderY = leadY + 8;
  const leadCols = [80, 373, 70];
  const leadHeaders = ["Lead Group", "AI Observation", "Status"];

  doc.setFillColor(...LIGHT_TEAL_BG).rect(MARGIN, leadHeaderY, CONTENT_W, 14, "F");
  let lx = MARGIN;
  leadHeaders.forEach((h, i) => {
    doc.setTextColor(...TEAL_TEXT).setFont("helvetica", "bold").setFontSize(6.5).text(h, lx + 4, leadHeaderY + 10);
    lx += leadCols[i];
  });

  const leadRows = cr?.lead_wise_review?.length
    ? cr.lead_wise_review
    : [
        { lead_group: "I / aVL", ai_observation: "No major high-confidence abnormality flagged in sample", status: "Review" },
        { lead_group: "II / III / aVF", ai_observation: "Possible ST-T morphology change", status: "Attention" },
        { lead_group: "V1-V3", ai_observation: "No dominant rhythm abnormality flagged in sample", status: "Review" },
        { lead_group: "V4-V6", ai_observation: "Voltage pattern may contribute to LVH flag", status: "Correlate" },
      ];

  let lRowY = leadHeaderY + 14;
  leadRows.forEach((r, ri) => {
    doc.setFillColor(ri % 2 === 0 ? 255 : 248, ri % 2 === 0 ? 255 : 250, 252).rect(MARGIN, lRowY, CONTENT_W, 18, "F");
    doc.setDrawColor(...BORDER_COLOR).rect(MARGIN, lRowY, CONTENT_W, 18, "S");

    doc.setTextColor(...DARK).setFont("helvetica", "bold").setFontSize(7.5).text(r.lead_group, MARGIN + 4, lRowY + 12);

    const obsLines = doc.splitTextToSize(r.ai_observation, 365);
    doc.setFont("helvetica", "normal").setFontSize(7.5).text(obsLines[0] ?? "", MARGIN + 84, lRowY + 12);

    drawStatusPill(r.status, MARGIN + 80 + 373 + 4, lRowY + 12);
    lRowY += 18;
  });

  // 2. Clinical Correlation Matrix
  const corrY = 174;
  drawSectionHeader("Clinical Correlation", corrY);
  const corrHeaderY = corrY + 8;
  const corrCols = [110, 100, 313];
  const corrHeaders = ["Clinical Factor", "Current Data", "Why it matters for review"];

  doc.setFillColor(...LIGHT_TEAL_BG).rect(MARGIN, corrHeaderY, CONTENT_W, 14, "F");
  let ccx = MARGIN;
  corrHeaders.forEach((h, i) => {
    doc.setTextColor(...TEAL_TEXT).setFont("helvetica", "bold").setFontSize(6.5).text(h, ccx + 4, corrHeaderY + 10);
    ccx += corrCols[i];
  });

  const corrRows = cr?.clinical_correlations?.length
    ? cr.clinical_correlations
    : [
        { clinical_factor: "Blood Pressure", current_data: `${a.bp_systolic}/${a.bp_diastolic} mmHg`, why_it_matters: "Elevated BP may be relevant to the voltage pattern and overall cardiovascular risk." },
        { clinical_factor: "Diabetes", current_data: a.diabetes_status || "Type 2", why_it_matters: "Important cardiovascular risk context when interpreting ECG abnormalities." },
        { clinical_factor: "Breathlessness", current_data: a.symptoms?.breathlessness ? "Present" : "Absent", why_it_matters: "Correlate with ECG findings, examination and other investigations." },
        { clinical_factor: "SpO2", current_data: `${a.spo2}%`, why_it_matters: "No low oxygen saturation in this sample assessment." },
      ];

  let cRowY = corrHeaderY + 14;
  corrRows.forEach((r, ri) => {
    doc.setFillColor(ri % 2 === 0 ? 255 : 248, ri % 2 === 0 ? 255 : 250, 252).rect(MARGIN, cRowY, CONTENT_W, 18, "F");
    doc.setDrawColor(...BORDER_COLOR).rect(MARGIN, cRowY, CONTENT_W, 18, "S");

    doc.setTextColor(...DARK).setFont("helvetica", "bold").setFontSize(7.5).text(r.clinical_factor, MARGIN + 4, cRowY + 12);
    doc.setFont("helvetica", "normal").setFontSize(7.5).text(r.current_data, MARGIN + 114, cRowY + 12);

    const whyLines = doc.splitTextToSize(r.why_it_matters, 305);
    doc.text(whyLines[0] ?? "", MARGIN + 214, cRowY + 12);
    cRowY += 18;
  });

  // 3. Previous ECG Comparison & Current Medicines (Side by Side)
  const prevY = 278;
  const sideW = 257;
  const sideH = 56;

  // Left: Previous ECG
  doc.setFillColor(...SLATE_BG).roundedRect(MARGIN, prevY, sideW, sideH, 4, 4, "F");
  doc.setDrawColor(...BORDER_COLOR).setLineWidth(0.5).roundedRect(MARGIN, prevY, sideW, sideH, 4, 4, "S");
  doc.setTextColor(...DARK).setFont("helvetica", "bold").setFontSize(8).text("Previous ECG Comparison", MARGIN + 8, prevY + 14);

  const prevComp = cr?.previous_ecg_comparison;
  const prevDate = prevComp?.prior_ecg_date || "Prior ECG: 12 Aug 2026";
  doc.setTextColor(...MID).setFont("helvetica", "bold").setFontSize(7).text(prevDate, MARGIN + 8, prevY + 26);

  const prevNote = prevComp?.comparison_note || "Possible new / more prominent ST-T change. Rhythm appears similar. Physician confirmation required.";
  const prevNoteLines = doc.splitTextToSize(prevNote, sideW - 16);
  doc.setFont("helvetica", "normal").setFontSize(6.5).setTextColor(...DARK);
  prevNoteLines.slice(0, 2).forEach((line: string, i: number) => {
    doc.text(line, MARGIN + 8, prevY + 37 + i * 9);
  });

  // Right: Current Medicines
  const medX = MARGIN + 266;
  doc.setFillColor(...SLATE_BG).roundedRect(medX, prevY, sideW, sideH, 4, 4, "F");
  doc.setDrawColor(...BORDER_COLOR).setLineWidth(0.5).roundedRect(medX, prevY, sideW, sideH, 4, 4, "S");
  doc.setTextColor(...DARK).setFont("helvetica", "bold").setFontSize(8).text("Current Medicines", medX + 8, prevY + 14);

  const meds = (a.medicines?.length ? a.medicines : ["Beta Blocker", "Antiplatelet", "Diabetes Medicine", "Other: None entered"]);
  let mx = medX + 8;
  let my = prevY + 28;
  meds.slice(0, 4).forEach((med: string) => {
    const mw = doc.getStringUnitWidth(med) * 6.5 / doc.internal.scaleFactor + 10;
    if (mx + mw > medX + sideW - 6) {
      mx = medX + 8;
      my += 14;
    }
    doc.setFillColor(220, 252, 231).roundedRect(mx, my - 7, mw, 11, 2, 2, "F");
    doc.setTextColor(22, 101, 52).setFont("helvetica", "bold").setFontSize(6.5).text(med, mx + 5, my + 1);
    mx += mw + 4;
  });

  // 4. Red-Flag Review Banner
  const redY = 344;
  const redH = 36;
  doc.setFillColor(254, 242, 242).roundedRect(MARGIN, redY, CONTENT_W, redH, 4, 4, "F");
  doc.setDrawColor(...URGENT_RED).setLineWidth(0.75).roundedRect(MARGIN, redY, CONTENT_W, redH, 4, 4, "S");
  doc.setTextColor(185, 28, 28).setFont("helvetica", "bold").setFontSize(8).text(cr?.red_flag_review?.status || "Physician review required", MARGIN + 8, redY + 13);

  const redSummary = cr?.red_flag_review?.summary || "No autonomous emergency diagnosis is issued. This sample does not show a high-confidence life-threatening rhythm flag; however, the ECG abnormality should be interpreted together with the patient's symptoms and risk profile.";
  const redLines = doc.splitTextToSize(redSummary, CONTENT_W - 16);
  doc.setFont("helvetica", "normal").setFontSize(6.5).setTextColor(127, 29, 29);
  redLines.slice(0, 2).forEach((line: string, i: number) => {
    doc.text(line, MARGIN + 8, redY + 23 + i * 8);
  });

  // 5. Doctor Validation & Final Interpretation
  const valY = 390;
  drawSectionHeader("Doctor Validation & Final Interpretation", valY);
  doc.setTextColor(...MID).setFont("helvetica", "bold").setFontSize(7).text("AI Interpretation Decision", MARGIN, valY + 14);

  // 3 Checkboxes
  const checkY = valY + 24;
  const checkOptions = [
    { label: "Confirm AI findings", x: MARGIN },
    { label: "Correct AI findings", x: MARGIN + 175 },
    { label: "Reject AI interpretation", x: MARGIN + 350 },
  ];
  const currentStatus = b.validation?.status;
  checkOptions.forEach((opt, idx) => {
    const isChecked = (idx === 0 && currentStatus === "confirm") ||
                      (idx === 1 && currentStatus === "correct") ||
                      (idx === 2 && currentStatus === "reject") ||
                      (!currentStatus && idx === 0);

    doc.setDrawColor(...MID).setLineWidth(0.75).rect(opt.x, checkY - 8, 9, 9, "S");
    if (isChecked) {
      doc.setFillColor(...TEAL).rect(opt.x + 1, checkY - 7, 7, 7, "F");
      doc.setDrawColor(255, 255, 255).setLineWidth(1);
      doc.line(opt.x + 2.5, checkY - 3.5, opt.x + 4, checkY - 2);
      doc.line(opt.x + 4, checkY - 2, opt.x + 6.5, checkY - 5.5);
    }
    doc.setTextColor(...DARK).setFont("helvetica", isChecked ? "bold" : "normal").setFontSize(7.5).text(opt.label, opt.x + 13, checkY - 1);
  });

  // Doctor Impression & Doctor Notes Boxes
  const boxesY = checkY + 8;
  const boxH = 50;
  // Left Box: Impression
  doc.setFillColor(255, 255, 255).roundedRect(MARGIN, boxesY, sideW, boxH, 3, 3, "F");
  doc.setDrawColor(...BORDER_COLOR).setLineWidth(0.5).roundedRect(MARGIN, boxesY, sideW, boxH, 3, 3, "S");
  doc.setTextColor(...MID).setFont("helvetica", "bold").setFontSize(6.5).text("Doctor's Final ECG Impression", MARGIN + 6, boxesY + 10);
  const docImpText = b.validation?.corrected_interpretation || "Confirmed AI findings as clinically appropriate.";
  const docImpLines = doc.splitTextToSize(docImpText, sideW - 12);
  doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(...DARK);
  docImpLines.slice(0, 3).forEach((line: string, i: number) => {
    doc.text(line, MARGIN + 6, boxesY + 21 + i * 9);
  });

  // Right Box: Notes
  doc.setFillColor(255, 255, 255).roundedRect(medX, boxesY, sideW, boxH, 3, 3, "F");
  doc.setDrawColor(...BORDER_COLOR).setLineWidth(0.5).roundedRect(medX, boxesY, sideW, boxH, 3, 3, "S");
  doc.setTextColor(...MID).setFont("helvetica", "bold").setFontSize(6.5).text("Doctor Notes / Recommended Action", medX + 6, boxesY + 10);
  const docNotesText = b.validation?.notes || "Routine follow-up in OPD. Correlate with serial ECG if symptoms recur.";
  const docNotesLines = doc.splitTextToSize(docNotesText, sideW - 12);
  doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(...DARK);
  docNotesLines.slice(0, 3).forEach((line: string, i: number) => {
    doc.text(line, medX + 6, boxesY + 21 + i * 9);
  });

  // 6. Patient Communication Summary - Doctor Reference
  const patSumY = 484;
  drawSectionHeader("Patient Communication Summary - Doctor Reference", patSumY);
  const patSumCardY = patSumY + 8;
  const patSumH = 40;
  doc.setFillColor(240, 249, 255).roundedRect(MARGIN, patSumCardY, CONTENT_W, patSumH, 4, 4, "F");
  doc.setDrawColor(2, 132, 199).setLineWidth(0.5).roundedRect(MARGIN, patSumCardY, CONTENT_W, patSumH, 4, 4, "S");

  const patText = cr?.patient_communication_summary || "The ECG contains changes that should be reviewed together with the patient's blood pressure, diabetes status and breathlessness. The treating doctor should decide whether further evaluation, treatment adjustment or follow-up is required.";
  const patLines = doc.splitTextToSize(patText, CONTENT_W - 16);
  doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(3, 105, 161);
  patLines.slice(0, 3).forEach((line: string, i: number) => {
    doc.text(line, MARGIN + 8, patSumCardY + 12 + i * 9);
  });

  // 7. Finalisation & Audit
  const auditY = 538;
  drawSectionHeader("Finalisation & Audit", auditY);
  const auditCardY = auditY + 8;
  const auditCardH = 38;
  doc.setFillColor(...SLATE_BG).roundedRect(MARGIN, auditCardY, CONTENT_W, auditCardH, 4, 4, "F");
  doc.setDrawColor(...BORDER_COLOR).setLineWidth(0.5).roundedRect(MARGIN, auditCardY, CONTENT_W, auditCardH, 4, 4, "S");

  const aColW = CONTENT_W / 4;
  const auditItems = [
    { label: "Doctor Name / ID", val: b.doctor?.display_name || "Dr. Treating Physician" },
    { label: "Validated On", val: b.validation?.validated_at ? new Date(b.validation.validated_at).toLocaleDateString("en-IN") : "Pending Review" },
    { label: "Final Status", val: b.validation ? (VALIDATION_LABEL[b.validation.status] ?? b.validation.status) : "Pending Review" },
    { label: "Report Version", val: "QDX-DoctorReport-v2.0" },
  ];
  auditItems.forEach((it, idx) => {
    const ax = MARGIN + idx * aColW + 6;
    doc.setTextColor(...MID).setFont("helvetica", "bold").setFontSize(6).text(it.label, ax, auditCardY + 12);
    doc.setTextColor(...DARK).setFont("helvetica", "bold").setFontSize(7.5).text(it.val, ax, auditCardY + 26);
  });

  // 8. Important Disclaimer
  const discY = 590;
  doc.setTextColor(...MID).setFont("helvetica", "bold").setFontSize(6.5).text("Important Disclaimer", MARGIN, discY);
  const discText = "Qardix AI is an AI-assisted clinical decision-support tool. AI-generated observations require review and validation by a qualified healthcare professional and should be interpreted together with the original ECG tracing, clinical history, examination and other relevant investigations. Qardix AI does not independently diagnose, prescribe treatment or replace physician judgement. This document is a demonstration sample and must not be used for patient care.";
  const discLines = doc.splitTextToSize(discText, CONTENT_W);
  doc.setFont("helvetica", "italic").setFontSize(5.8).setTextColor(...MID);
  discLines.slice(0, 3).forEach((line: string, i: number) => {
    doc.text(line, MARGIN, discY + 8 + i * 7.5);
  });

  // Page 2 Footer
  drawFooter(2);

  // Trigger PDF file download
  const safeFilename = `${(b.report?.report_code || "qardix-report").replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
  doc.save(safeFilename);
}


