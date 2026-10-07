import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { adminQuery } from "@/lib/admin-data";
import { casesQuery } from "@/lib/doctor-data";
import { downloadXlsx } from "@/lib/export";
import { CasesTable } from "@/components/cases-table";
import { ConfirmToggle } from "@/components/confirm-toggle";
import { useToggleAccount } from "@/components/accounts-admin";
import { Empty, Kpi, PageHeader, Panel, StatusBadge, fmtDate } from "@/components/kit";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/doctors/$id")({
  head: () => ({ meta: [{ title: "Doctor detail — Qardix AI" }] }),
  component: DoctorDetail,
});

function DoctorDetail() {
  const { id } = Route.useParams();
  const { data } = useQuery(adminQuery);
  const { data: cases = [] } = useQuery(casesQuery);
  const toggle = useToggleAccount();
  const d = data?.accounts.find((a) => a.id === id);
  if (!data) return null;
  if (!d) return <Empty>Doctor not found.</Empty>;
  const company = data.companies.find((c) => c.id === d.company_id);
  const own = cases.filter((c) => c.doctor_id === id);
  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild><Link to="/admin/doctors"><ArrowLeft className="mr-2 size-4" /> Doctors</Link></Button>
      <PageHeader title={d.display_name} subtitle={`${d.specialty ?? "Doctor"} · ${company?.name ?? "—"}`}
        actions={<Button variant="outline" onClick={() => downloadXlsx(`${d.login_id}-data`, { Profile: [{ ...d }], Assessments: own as never })}><FileSpreadsheet className="mr-2 size-4" /> Download data</Button>} />
      <div className="grid gap-4 sm:grid-cols-4">
        <Kpi label="Total ECG analyses" value={own.length} tone="signal" />
        <Kpi label="Reports" value={own.filter((c) => c.report_code).length} />
        <Kpi label="Last activity" value={<span className="text-lg">{fmtDate(d.last_activity_at)}</span>} />
        <div className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-card)]">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Account status</p>
          <div className="mt-4 flex items-center gap-3"><ConfirmToggle active={d.status === "active"} name={d.display_name} warning="Only this doctor will lose access." onConfirm={() => toggle(d)} /><StatusBadge status={d.status} /></div>
          {company?.status === "inactive" && <p className="mt-2 text-xs text-urgent">Blocked: company inactive</p>}
        </div>
      </div>
      <Panel title="Profile">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          {[["Login ID", d.login_id], ["Email", d.email ?? "—"], ["Company", company?.name ?? "—"], ["Specialty", d.specialty ?? "—"], ["Created", fmtDate(d.created_at)]].map(([k, v]) => (
            <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>
          ))}
        </dl>
      </Panel>
      <Panel title="Analyses"><CasesTable rows={own} detailBase="/admin/reports" /></Panel>
    </div>
  );
}
