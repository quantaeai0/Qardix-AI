import { createFileRoute } from "@tanstack/react-router";
import { RawTable } from "@/components/raw-table";
import { UrgencyBadge, fmtDate } from "@/components/kit";

export const Route = createFileRoute("/_authenticated/admin/analyses")({
  head: () => ({ meta: [{ title: "ECG Analyses — Qardix AI" }] }),
  component: () => (
    <RawTable table="ai_results" title="ECG Analyses" subtitle="Original AI output, stored separately from doctor validation" cols={[
      { key: "created_at", label: "Date", render: (r) => fmtDate(r.created_at, true) },
      { key: "doctor_id", label: "Doctor / Company", render: (r, c) => <><p className="font-medium">{c.name(r.doctor_id)}</p><p className="text-xs text-muted-foreground">{c.company(r.company_id)}</p></> },
      { key: "ai_summary", label: "AI summary" },
      { key: "abnormal_leads", label: "Abnormal leads", render: (r) => <span className="font-mono text-xs">{r.abnormal_leads?.join(", ") || "—"}</span> },
      { key: "confidence", label: "Confidence", render: (r) => `${Math.round((r.confidence_json?.overall ?? 0) * 100)}%` },
      { key: "urgency", label: "Urgency", render: (r) => <UrgencyBadge urgency={r.urgency} /> },
      { key: "model", label: "Model", render: (r) => <span className="font-mono text-xs">{r.raw_output_json?.model_version ?? "demo-mock-1.0"}</span> },
    ]} />
  ),
});
