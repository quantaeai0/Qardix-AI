import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { downloadReportPdf, loadReportBundle } from "@/lib/reports";
import { ReportView } from "@/components/report-view";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/kit";

export function ReportDetailPage({ id, back }: { id: string; back: "/doctor/reports" | "/admin/reports" }) {
  const { data, isLoading, error } = useQuery({ queryKey: ["report", id], queryFn: () => loadReportBundle(id) });
  if (isLoading) return <div className="h-96 animate-pulse rounded-3xl bg-muted" />;
  if (error || !data) return <Empty>Report not found or you do not have access.</Empty>;
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="no-print flex flex-wrap gap-2">
        <Button variant="ghost" asChild><Link to={back}><ArrowLeft className="mr-2 size-4" /> Back</Link></Button>
        <div className="ml-auto flex gap-2">
          <Button onClick={() => downloadReportPdf(data)}><Download className="mr-2 size-4" /> Download PDF</Button>
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 size-4" /> Print</Button>
        </div>
      </div>
      <ReportView b={data} />
    </div>
  );
}
