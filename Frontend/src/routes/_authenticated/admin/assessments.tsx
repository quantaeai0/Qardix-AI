import { createFileRoute } from "@tanstack/react-router";
import { RawTable } from "@/components/raw-table";
import { fmtDate } from "@/components/kit";
import { SYMPTOM_LABELS } from "@/lib/reports";

export const Route = createFileRoute("/_authenticated/admin/assessments")({
  head: () => ({ meta: [{ title: "Patient Assessments — Qardix AI" }] }),
  component: () => (
    <RawTable table="patient_assessments" title="Patient Assessments" subtitle="De-identified clinical context captured by doctors" cols={[
      { key: "anonymous_patient_id", label: "Patient ID", render: (r) => <span className="font-mono text-xs">{r.anonymous_patient_id}</span> },
      { key: "created_at", label: "Date", render: (r) => fmtDate(r.created_at, true) },
      { key: "doctor_id", label: "Doctor / Company", render: (r, c) => <><p className="font-medium">{c.name(r.doctor_id)}</p><p className="text-xs text-muted-foreground">{c.company(r.company_id)}</p></> },
      { key: "age", label: "Age / Sex", render: (r) => `${r.age} · ${r.sex}` },
      { key: "vitals", label: "Vitals", render: (r) => <span className="text-xs">BP {r.bp_systolic}/{r.bp_diastolic} · HR {r.heart_rate} · SpO₂ {r.spo2}% · BMI {r.bmi}</span> },
      { key: "diabetes_status", label: "Diabetes" },
      { key: "symptoms", label: "Symptoms", render: (r) => <span className="text-xs">{Object.entries(r.symptoms ?? {}).filter(([, v]) => v).map(([k]) => SYMPTOM_LABELS[k]).join(", ") || "None"}</span> },
      { key: "medicines", label: "Medicines", render: (r) => <span className="text-xs">{r.medicines?.join(", ") || "None"}</span> },
      { key: "training_consent", label: "Training consent", render: (r) => (r.training_consent ? "Yes" : "No") },
    ]} />
  ),
});
