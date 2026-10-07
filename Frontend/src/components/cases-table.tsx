import { Link } from "@tanstack/react-router";
import { Download, Eye } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { CaseRow } from "@/lib/doctor-data";
import { downloadReportPdf, loadReportBundle } from "@/lib/reports";
import { Empty, UrgencyBadge, ValidationBadge, fmtDate } from "@/components/kit";
import { Button } from "@/components/ui/button";

export function CasesTable({ rows, detailBase = "/doctor/reports", extraCols }: { rows: CaseRow[]; detailBase?: "/doctor/reports" | "/admin/reports"; extraCols?: { head: string; cell: (r: CaseRow) => React.ReactNode }[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!rows.length) return <Empty>No assessments yet.</Empty>;
  async function dl(id: string) {
    try {
      setBusy(id);
      await downloadReportPdf(await loadReportBundle(id));
    } catch {
      toast.error("Could not generate PDF");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-5 py-2.5 font-medium">Patient ID</th>
            <th className="px-3 py-2.5 font-medium">Date</th>
            {extraCols?.map((c) => <th key={c.head} className="px-3 py-2.5 font-medium">{c.head}</th>)}
            <th className="px-3 py-2.5 font-medium">AI summary</th>
            <th className="px-3 py-2.5 font-medium">Urgency</th>
            <th className="px-3 py-2.5 font-medium">Validation</th>
            <th className="px-5 py-2.5 text-right font-medium">Report</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
              <td className="px-5 py-3 font-mono text-xs font-medium text-foreground">{r.anonymous_patient_id}</td>
              <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{fmtDate(r.created_at, true)}</td>
              {extraCols?.map((c) => <td key={c.head} className="px-3 py-3">{c.cell(r)}</td>)}
              <td className="max-w-[280px] truncate px-3 py-3 text-foreground">{r.ai_summary ?? "—"}</td>
              <td className="px-3 py-3">{r.urgency ? <UrgencyBadge urgency={r.urgency} /> : "—"}</td>
              <td className="px-3 py-3"><ValidationBadge status={r.validation_status} /></td>
              <td className="px-5 py-3">
                <div className="flex justify-end gap-1">
                  <Button asChild size="sm" variant="ghost"><Link to={`${detailBase}/$id`} params={{ id: r.id }}><Eye className="size-4" /></Link></Button>
                  <Button size="sm" variant="outline" disabled={!r.report_code || busy === r.id} onClick={() => dl(r.id)}>
                    <Download className="mr-1 size-3.5" /> PDF
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
