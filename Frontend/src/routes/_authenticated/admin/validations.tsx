import { createFileRoute } from "@tanstack/react-router";
import { RawTable } from "@/components/raw-table";
import { ValidationBadge, fmtDate } from "@/components/kit";

export const Route = createFileRoute("/_authenticated/admin/validations")({
  head: () => ({ meta: [{ title: "Doctor Validations — Qardix AI" }] }),
  component: () => (
    <RawTable table="doctor_validations" title="Doctor Validations" subtitle="Confirm / Correct / Reject decisions and doctor final interpretations" cols={[
      { key: "validated_at", label: "Validated", render: (r) => fmtDate(r.validated_at, true) },
      { key: "doctor_id", label: "Doctor / Company", render: (r, c) => <><p className="font-medium">{c.name(r.doctor_id)}</p><p className="text-xs text-muted-foreground">{c.company(r.company_id)}</p></> },
      { key: "status", label: "Decision", render: (r) => <ValidationBadge status={r.status} /> },
      { key: "corrected_interpretation", label: "Doctor final interpretation" },
      { key: "notes", label: "Notes" },
    ]} />
  ),
});
