import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import { adminQuery } from "@/lib/admin-data";
import { trend } from "@/lib/mm-data";
import { ConfirmToggle } from "@/components/confirm-toggle";
import { Empty, Kpi, PageHeader, Panel, StatusBadge, fmtDate } from "@/components/kit";
import { TrendChart } from "@/components/trend-chart";
import { Button } from "@/components/ui/button";
import { CompanyDialog, useSetCompanyStatus } from "@/components/company-admin";

export const Route = createFileRoute("/_authenticated/admin/companies/$id")({
  head: () => ({ meta: [{ title: "Company detail — Qardix AI" }] }),
  component: CompanyDetail,
});

function CompanyDetail() {
  const { id } = Route.useParams();
  const { data } = useQuery(adminQuery);
  const toggle = useSetCompanyStatus();
  const [edit, setEdit] = useState(false);
  if (!data) return null;
  const c = data.companies.find((x) => x.id === id);
  if (!c) return <Empty>Company not found.</Empty>;
  const members = data.accounts.filter((a) => a.company_id === id);
  const analyses = data.events.filter((e) => e.company_id === id && e.event_type === "analysis_completed");
  const list = (role: string) => members.filter((m) => m.role === role);
  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild><Link to="/admin/companies"><ArrowLeft className="mr-2 size-4" /> Companies</Link></Button>
      <PageHeader title={c.name} subtitle={`${c.code} · ${c.primary_contact ?? ""} · ${c.contact_email ?? ""}`}
        actions={<><div className="flex items-center gap-2 rounded-lg border px-3"><ConfirmToggle active={c.status === "active"} name={c.name} warning="Every Marketing Manager and Doctor under this company will lose access immediately." onConfirm={() => toggle(c)} /><StatusBadge status={c.status} /></div><Button variant="outline" onClick={() => setEdit(true)}><Pencil className="mr-2 size-4" /> Edit</Button></>} />
      <div className="grid gap-4 sm:grid-cols-4">
        <Kpi label="Marketing managers" value={list("marketing_manager").length} />
        <Kpi label="Doctors" value={list("doctor").length} />
        <Kpi label="Active doctors" value={list("doctor").filter((d) => d.status === "active").length} tone="routine" />
        <Kpi label="ECG analyses" value={analyses.length} tone="signal" />
      </div>
      <Panel title="Usage summary"><TrendChart data={trend(analyses, "week")} /></Panel>
      <div className="grid gap-6 lg:grid-cols-2">
        {(["marketing_manager", "doctor"] as const).map((r) => (
          <Panel key={r} title={r === "doctor" ? "Doctors" : "Marketing managers"}>
            {list(r).length ? (
              <ul className="divide-y">{list(r).map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div><p className="font-medium">{r === "doctor" ? <Link to="/admin/doctors/$id" params={{ id: m.id }} className="hover:text-signal">{m.display_name}</Link> : m.display_name}</p><p className="font-mono text-xs text-muted-foreground">{m.login_id}</p></div>
                  <div className="text-right"><StatusBadge status={m.status} /><p className="mt-1 text-xs text-muted-foreground">{fmtDate(m.last_activity_at)}</p></div>
                </li>
              ))}</ul>
            ) : <Empty>None yet.</Empty>}
          </Panel>
        ))}
      </div>
      {c.notes && <Panel title="Notes"><p className="text-sm">{c.notes}</p></Panel>}
      {edit && <CompanyDialog value={c} onClose={() => setEdit(false)} />}
    </div>
  );
}
