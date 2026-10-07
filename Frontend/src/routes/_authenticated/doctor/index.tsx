import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, ArrowRight, CalendarDays, FileText } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { casesQuery } from "@/lib/doctor-data";
import { CasesTable } from "@/components/cases-table";
import { Kpi, Panel, SafetyNote } from "@/components/kit";
import { EcgLine } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { URGENCY_LABEL } from "@/lib/mock-ai";

export const Route = createFileRoute("/_authenticated/doctor/")({
  head: () => ({ meta: [{ title: "Doctor Dashboard — Qardix AI" }] }),
  component: DoctorDashboard,
});

const COLORS: Record<string, string> = { routine: "var(--routine)", review_soon: "var(--soon)", urgent: "var(--urgent)" };

function DoctorDashboard() {
  const { session } = Route.useRouteContext();
  const { data: cases = [] } = useQuery(casesQuery);
  const now = new Date();
  const month = cases.filter((c) => { const d = new Date(c.created_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;
  const urgentRecent = cases.filter((c) => c.urgency === "urgent" && Date.now() - new Date(c.created_at).getTime() < 30 * 864e5).length;
  const dist = (["routine", "review_soon", "urgent"] as const).map((k) => ({ key: k, name: URGENCY_LABEL[k], value: cases.filter((c) => c.urgency === k).length }));

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-navy p-7 text-navy-foreground sm:p-10">
        <div className="ecg-grid absolute inset-0 opacity-40" />
        <EcgLine animated className="absolute bottom-3 left-0 h-14 text-signal/30" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-navy-foreground/70">{session.company?.name}</p>
            <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">Welcome, {session.profile.display_name}</h1>
            <p className="mt-2 max-w-lg text-navy-foreground/70">Upload a 12-lead ECG with minimal clinical context and review AI-assisted findings in minutes.</p>
          </div>
          <Button asChild size="lg" className="h-12 bg-signal px-6 text-signal-foreground hover:bg-signal/90">
            <Link to="/doctor/new">Start New ECG Assessment <ArrowRight className="ml-1 size-4" /></Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total ECGs analysed" value={cases.length} icon={<Activity className="size-4" />} tone="signal" />
        <Kpi label="Reports generated" value={cases.filter((c) => c.report_code).length} icon={<FileText className="size-4" />} />
        <Kpi label="This month" value={month} icon={<CalendarDays className="size-4" />} />
        <Kpi label="Recent urgent reviews" value={urgentRecent} hint="Last 30 days" icon={<AlertTriangle className="size-4" />} tone="urgent" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Recent reports" action={<Link to="/doctor/reports" className="text-sm font-medium text-signal">View all</Link>}>
          <CasesTable rows={cases.slice(0, 6)} />
        </Panel>
        <Panel title="Urgency breakdown · your cases">
          <div className="h-48">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={dist} dataKey="value" nameKey="name" innerRadius={50} outerRadius={75} paddingAngle={3}>
                  {dist.map((d) => <Cell key={d.key} fill={COLORS[d.key]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 space-y-2 text-sm">
            {dist.map((d) => (
              <li key={d.key} className="flex items-center justify-between">
                <span className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: COLORS[d.key] }} />{d.name}</span>
                <span className="font-semibold">{d.value}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <SafetyNote />
    </div>
  );
}
