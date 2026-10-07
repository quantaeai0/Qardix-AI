import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { casesQuery } from "@/lib/doctor-data";
import { CasesTable } from "@/components/cases-table";
import { PageHeader, Panel } from "@/components/kit";

export const Route = createFileRoute("/_authenticated/doctor/history")({
  head: () => ({ meta: [{ title: "My History — Qardix AI" }] }),
  component: () => {
    const { data = [] } = useQuery(casesQuery);
    return (
      <div>
        <PageHeader title="My History" subtitle="Every ECG assessment you have performed" />
        <Panel>
          <CasesTable rows={data} extraCols={[{ head: "Age / Sex", cell: (r) => `${r.age} · ${r.sex}` }, { head: "Quality", cell: (r) => <span className="text-xs capitalize">{r.quality_status ?? "—"}</span> }]} />
        </Panel>
      </div>
    );
  },
});
