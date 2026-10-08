import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-client";
import { ProfilePage } from "@/components/profile-page";
import { Panel, fmtDate } from "@/components/kit";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({ meta: [{ title: "Settings — Qardix AI" }] }),
  component: Settings,
});

function Settings() {
  const { session } = Route.useRouteContext();
  const { data = [] } = useQuery({ queryKey: ["demo-requests"], queryFn: async () => (await apiRequest("/public/demo-requests").catch(() => [])) ?? [] });
  return (
    <div className="space-y-6">
      <ProfilePage session={session} />
      <div className="max-w-3xl space-y-6">
        <Panel title="AI analysis engine">
          <p className="text-sm text-muted-foreground">Operating with <b className="text-foreground">DeepECG WCR-77 AI inference pipeline</b>. Automated OpenCV quality inspection, digitized lead wave analysis, and clinician-in-the-loop validation.</p>
        </Panel>
        <Panel title={`Demo requests (${data.length})`}>
          <ul className="divide-y text-sm">
            {data.map((d: any) => <li key={d.id} className="py-2.5"><p className="font-medium">{d.name} · {d.organisation}</p><p className="text-xs text-muted-foreground">{d.email} · {fmtDate(d.created_at)}</p></li>)}
            {!data.length && <li className="py-2 text-muted-foreground">No requests yet.</li>}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
