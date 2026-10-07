import { createFileRoute } from "@tanstack/react-router";
import { DoctorUsageTable, ExportButtons, Filters, useMmUsage } from "@/components/mm-usage";
import { PageHeader, Panel } from "@/components/kit";

export const Route = createFileRoute("/_authenticated/mm/doctors")({
  head: () => ({ meta: [{ title: "Doctors — Qardix AI" }] }),
  component: () => {
    const u = useMmUsage();
    return (
      <div>
        <PageHeader title="Doctors" subtitle="Doctor accounts and ECG usage in your programme" actions={<ExportButtons u={u} />} />
        <Panel title={<Filters u={u} />}><DoctorUsageTable rows={u.perDoctor} /></Panel>
      </div>
    );
  },
});
