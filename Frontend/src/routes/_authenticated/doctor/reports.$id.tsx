import { createFileRoute } from "@tanstack/react-router";
import { ReportDetailPage } from "@/components/report-detail-page";

export const Route = createFileRoute("/_authenticated/doctor/reports/$id")({
  head: () => ({ meta: [{ title: "Report — Qardix AI" }] }),
  component: () => <ReportDetailPage id={Route.useParams().id} back="/doctor/reports" />,
});
