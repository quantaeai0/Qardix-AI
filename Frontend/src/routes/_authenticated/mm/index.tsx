import { createFileRoute } from "@tanstack/react-router";
import { MmDashboard } from "@/components/mm-usage";

export const Route = createFileRoute("/_authenticated/mm/")({
  head: () => ({ meta: [{ title: "Marketing Dashboard — Qardix AI" }] }),
  component: () => <MmDashboard session={Route.useRouteContext().session} />,
});
