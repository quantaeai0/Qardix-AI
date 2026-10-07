import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { adminQuery } from "@/lib/admin-data";
import { casesQuery } from "@/lib/doctor-data";
import { CasesTable } from "@/components/cases-table";
import { PageHeader, Panel, Sel } from "@/components/kit";

export const Route = createFileRoute("/_authenticated/admin/reports/")({
  head: () => ({ meta: [{ title: "Reports — Qardix AI" }] }),
  component: () => {
    const { data: core } = useQuery(adminQuery);
    const { data = [] } = useQuery(casesQuery);
    const [company, setCompany] = useState("all");
    const rows = data.filter((r) => company === "all" || r.company_id === company);
    const name = (id: string) => core?.accounts.find((a) => a.id === id)?.display_name ?? "—";
    return (
      <div>
        <PageHeader title="Reports" subtitle="All generated heart-health reports across the platform" />
        <Panel title={<Sel value={company} onChange={setCompany} opts={[["all", "All companies"], ...(core?.companies ?? []).map((c) => [c.id, c.name] as [string, string])]} />}>
          <CasesTable rows={rows} detailBase="/admin/reports" extraCols={[{ head: "Doctor", cell: (r) => name(r.doctor_id) }]} />
        </Panel>
      </div>
    );
  },
});
