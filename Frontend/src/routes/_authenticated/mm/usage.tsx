import { createFileRoute } from "@tanstack/react-router";
import { FileSpreadsheet, FileText } from "lucide-react";
import { BucketToggle, exportUsage, Filters, useMmUsage } from "@/components/mm-usage";
import { PageHeader, Panel } from "@/components/kit";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/mm/usage")({
  head: () => ({ meta: [{ title: "Export Usage — Qardix AI" }] }),
  component: () => {
    const u = useMmUsage();
    return (
      <div className="max-w-3xl">
        <PageHeader title="Export Usage" subtitle="Download own-company doctor-wise and date-wise aggregate usage" />
        <Panel>
          <div className="space-y-4">
            <Filters u={u} />
            <div className="flex items-center gap-3 text-sm"><span className="text-muted-foreground">Date-wise grouping</span><BucketToggle u={u} /></div>
            <p className="text-sm text-muted-foreground">{u.analyses.length} ECG analyses across {u.perDoctor.length} doctors match the filters.</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => exportUsage(u, "csv")}><FileText className="mr-2 size-4" /> Doctor-wise CSV</Button>
              <Button variant="outline" onClick={() => exportUsage(u, "xlsx")}><FileSpreadsheet className="mr-2 size-4" /> Excel (doctor + date-wise)</Button>
            </div>
          </div>
        </Panel>
      </div>
    );
  },
});
