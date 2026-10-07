import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Activity, Building2, FileText, Megaphone, Stethoscope } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { adminQuery } from "@/lib/admin-data";
import { casesQuery } from "@/lib/doctor-data";
import { trend, type Bucket } from "@/lib/mm-data";
import { Kpi, PageHeader, Panel, Sel, UrgencyBadge, ValidationBadge, fmtDate } from "@/components/kit";
import { TrendChart } from "@/components/trend-chart";
import { Input } from "@/components/ui/input";
import { URGENCY_LABEL } from "@/lib/mock-ai";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Super Admin Dashboard — Qardix AI" }] }),
  component: AdminDashboard,
});

const UC: Record<string, string> = { routine: "var(--routine)", review_soon: "var(--soon)", urgent: "var(--urgent)" };

function AdminDashboard() {
  const { data } = useQuery(adminQuery);
  const { data: cases = [] } = useQuery(casesQuery);
  const [company, setCompany] = useState("all");
  const [doctor, setDoctor] = useState("all");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [bucket] = useState<Bucket>("day");
  const companies = data?.companies ?? [];
  const accounts = data?.accounts ?? [];
  const doctors = accounts.filter((a) => a.role === "doctor");
  const mms = accounts.filter((a) => a.role === "marketing_manager");
  const nameOf = (id: string | null) => accounts.find((a) => a.id === id)?.display_name ?? "—";
  const compOf = (id: string | null) => companies.find((c) => c.id === id)?.name ?? "—";

  const filtered = useMemo(() => cases.filter((c) =>
    (company === "all" || c.company_id === company) && (doctor === "all" || c.doctor_id === doctor)
    && (status === "all" || c.urgency === status || (status === "pending" && !c.validation_status))
    && (!from || c.created_at >= from) && (!to || c.created_at <= to + "T23:59:59")), [cases, company, doctor, status, from, to]);

  const byCompany = companies.map((c) => ({ name: c.code, value: filtered.filter((x) => x.company_id === c.id).length }));
  const byDoctor = doctors.map((d) => ({ name: d.display_name.replace("Dr. ", ""), value: filtered.filter((x) => x.doctor_id === d.id).length })).filter((d) => d.value > 0);
  const dist = (["routine", "review_soon", "urgent"] as const).map((k) => ({ key: k, name: URGENCY_LABEL[k], value: filtered.filter((c) => c.urgency === k).length }));

  return (
    <div className="space-y-6">
      <PageHeader title="Platform overview" subtitle="All companies, users and ECG activity across Qardix AI" />
      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Total companies" value={companies.length} icon={<Building2 className="size-4" />} />
        <Kpi label="Active companies" value={companies.filter((c) => c.status === "active").length} tone="routine" icon={<Building2 className="size-4" />} />
        <Kpi label="Inactive companies" value={companies.filter((c) => c.status !== "active").length} icon={<Building2 className="size-4" />} />
        <Kpi label="Total MMs" value={mms.length} icon={<Megaphone className="size-4" />} />
        <Kpi label="Total doctors" value={doctors.length} icon={<Stethoscope className="size-4" />} />
        <Kpi label="Active doctors" value={doctors.filter((d) => d.status === "active").length} tone="routine" icon={<Stethoscope className="size-4" />} />
        <Kpi label="Inactive doctors" value={doctors.filter((d) => d.status !== "active").length} icon={<Stethoscope className="size-4" />} />
        <Kpi label="Total ECG analyses" value={cases.length} tone="signal" icon={<Activity className="size-4" />} />
        <Kpi label="Reports generated" value={cases.filter((c) => c.report_code).length} icon={<FileText className="size-4" />} />
      </div>

      <Panel>
        <div className="flex flex-wrap gap-2">
          <Sel value={company} onChange={setCompany} opts={[["all", "All companies"], ...companies.map((c) => [c.id, c.name] as [string, string])]} />
          <Sel value={doctor} onChange={setDoctor} opts={[["all", "All doctors"], ...doctors.map((d) => [d.id, d.display_name] as [string, string])]} />
          <Sel value={status} onChange={setStatus} opts={[["all", "All statuses"], ["routine", "Routine"], ["review_soon", "Review Soon"], ["urgent", "Urgent Review"], ["pending", "Pending validation"]]} />
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" aria-label="From" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" aria-label="To" />
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Date-wise ECG trend"><TrendChart data={trend(filtered, bucket)} /></Panel>
        <Panel title="Urgency distribution">
          <div className="flex h-60 items-center">
            <ResponsiveContainer width="55%">
              <PieChart><Pie data={dist} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>{dist.map((d) => <Cell key={d.key} fill={UC[d.key]} />)}</Pie><Tooltip /></PieChart>
            </ResponsiveContainer>
            <ul className="flex-1 space-y-3 text-sm">{dist.map((d) => <li key={d.key} className="flex justify-between"><span className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: UC[d.key] }} />{d.name}</span><b>{d.value}</b></li>)}</ul>
          </div>
        </Panel>
        <Panel title="Company-wise ECG analyses"><Bars data={byCompany} color="var(--navy)" /></Panel>
        <Panel title="Doctor-wise usage"><Bars data={byDoctor} color="var(--signal)" /></Panel>
      </div>

      <Panel title="Recent activity">
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-2.5 font-medium">Company</th><th className="px-3 py-2.5 font-medium">Doctor</th><th className="px-3 py-2.5 font-medium">Date / time</th><th className="px-3 py-2.5 font-medium">Analysis</th><th className="px-3 py-2.5 font-medium">Validation</th><th className="px-5 py-2.5 font-medium">Report</th>
            </tr></thead>
            <tbody>{filtered.slice(0, 10).map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="px-5 py-3">{compOf(c.company_id)}</td><td className="px-3 py-3 font-medium">{nameOf(c.doctor_id)}</td><td className="px-3 py-3 text-muted-foreground">{fmtDate(c.created_at, true)}</td>
                <td className="px-3 py-3">{c.urgency ? <UrgencyBadge urgency={c.urgency} /> : "Processing"}</td><td className="px-3 py-3"><ValidationBadge status={c.validation_status} /></td>
                <td className="px-5 py-3 text-xs">{c.report_code ? <span className="font-mono">{c.report_code}</span> : <span className="text-soon">Pending</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Bars({ data, color }: { data: { name: string; value: number }[]; color: string }) {
  return (
    <div className="h-60">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: -20 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip /><Bar dataKey="value" name="ECGs" fill={color} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
