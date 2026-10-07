import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { casesQuery } from "@/lib/doctor-data";
import { CasesTable } from "@/components/cases-table";
import { PageHeader, Panel } from "@/components/kit";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/doctor/reports/")({
  head: () => ({ meta: [{ title: "My Reports — Qardix AI" }] }),
  component: () => {
    const { data = [] } = useQuery(casesQuery);
    const [q, setQ] = useState("");
    const [u, setU] = useState("all");
    const rows = data.filter((r) => r.report_code && (u === "all" || r.urgency === u) && r.anonymous_patient_id.toLowerCase().includes(q.toLowerCase()));
    return (
      <div>
        <PageHeader title="My Reports" subtitle="Doctor-validated heart-health reports" />
        <Panel>
          <div className="mb-4 flex flex-wrap gap-2">
            <Input placeholder="Search Patient ID" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
            <select value={u} onChange={(e) => setU(e.target.value)} className="h-9 rounded-md border bg-card px-3 text-sm">
              <option value="all">All urgency</option><option value="routine">Routine</option><option value="review_soon">Review Soon</option><option value="urgent">Urgent Review</option>
            </select>
          </div>
          <CasesTable rows={rows} />
        </Panel>
      </div>
    );
  },
});
