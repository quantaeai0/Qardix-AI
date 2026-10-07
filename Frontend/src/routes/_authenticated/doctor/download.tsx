import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, FileText } from "lucide-react";
import { casesQuery } from "@/lib/doctor-data";
import { downloadCsv, downloadXlsx } from "@/lib/export";
import { PageHeader, Panel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { URGENCY_LABEL, type Urgency } from "@/lib/mock-ai";

export const Route = createFileRoute("/_authenticated/doctor/download")({
  head: () => ({ meta: [{ title: "Download Data — Qardix AI" }] }),
  component: () => {
    const { data = [] } = useQuery(casesQuery);
    const rows = data.map((r) => ({
      patient_id: r.anonymous_patient_id, date: new Date(r.created_at).toISOString(), age: r.age, sex: r.sex,
      ai_summary: r.ai_summary, urgency: r.urgency ? URGENCY_LABEL[r.urgency as Urgency] : "", validation: r.validation_status, report_id: r.report_code,
    }));
    return (
      <div>
        <PageHeader title="Download Data" subtitle="Your own analysis history. Individual PDF reports are available from My Reports." />
        <Panel title={`${rows.length} records`}>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => downloadCsv("qardix-my-history", rows)}><FileText className="mr-2 size-4" /> Download CSV</Button>
            <Button variant="outline" onClick={() => downloadXlsx("qardix-my-history", { History: rows })}><FileSpreadsheet className="mr-2 size-4" /> Download Excel</Button>
          </div>
        </Panel>
      </div>
    );
  },
});
