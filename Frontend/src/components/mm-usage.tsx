import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Activity, CalendarDays, FileSpreadsheet, FileText, UserCheck, UserX, Users } from "lucide-react";
import { mmQuery, trend, type Bucket } from "@/lib/mm-data";
import { downloadCsv, downloadXlsx } from "@/lib/export";
import { Kpi, Panel, StatusBadge, fmtDate } from "@/components/kit";
import { TrendChart } from "@/components/trend-chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SessionInfo } from "@/lib/session";
import { cn } from "@/lib/utils";

export function useMmUsage() {
  const { data } = useQuery(mmQuery);
  const [doctor, setDoctor] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [bucket, setBucket] = useState<Bucket>("day");
  const doctors = data?.doctors ?? [];
  const analyses = useMemo(() => (data?.events ?? []).filter((e) => e.event_type === "analysis_completed"
    && (doctor === "all" || e.doctor_id === doctor)
    && (!from || e.created_at >= from) && (!to || e.created_at <= to + "T23:59:59")), [data, doctor, from, to]);
  const perDoctor = doctors.map((d) => {
    const own = analyses.filter((e) => e.doctor_id === d.id);
    return { doctor: d.display_name, status: d.status, total_ecgs: own.length, last_analysis: own.at(-1)?.created_at ?? null, last_activity: d.last_activity_at };
  }).filter((r) => doctor === "all" || doctors.find((d) => d.display_name === r.doctor)?.id === doctor);
  return { doctors, analyses, perDoctor, doctor, setDoctor, from, setFrom, to, setTo, bucket, setBucket, series: trend(analyses, bucket) };
}

export function Filters({ u }: { u: ReturnType<typeof useMmUsage> }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <select value={u.doctor} onChange={(e) => u.setDoctor(e.target.value)} className="h-9 rounded-md border bg-card px-3 text-sm">
        <option value="all">All doctors</option>
        {u.doctors.map((d) => <option key={d.id} value={d.id}>{d.display_name}</option>)}
      </select>
      <Input type="date" value={u.from} onChange={(e) => u.setFrom(e.target.value)} className="h-9 w-40" aria-label="From date" />
      <Input type="date" value={u.to} onChange={(e) => u.setTo(e.target.value)} className="h-9 w-40" aria-label="To date" />
    </div>
  );
}

export function BucketToggle({ u }: { u: ReturnType<typeof useMmUsage> }) {
  return (
    <div className="inline-flex rounded-lg bg-muted p-0.5">
      {(["day", "week", "month"] as const).map((b) => (
        <button key={b} onClick={() => u.setBucket(b)} className={cn("rounded-md px-3 py-1 text-xs font-medium capitalize", u.bucket === b ? "bg-card shadow-sm" : "text-muted-foreground")}>{b}</button>
      ))}
    </div>
  );
}

export function exportUsage(u: ReturnType<typeof useMmUsage>, kind: "csv" | "xlsx") {
  const doctorRows = u.perDoctor.map((r) => ({ ...r, last_analysis: r.last_analysis ? fmtDate(r.last_analysis) : "", last_activity: r.last_activity ? fmtDate(r.last_activity) : "" }));
  const dateRows = trend(u.analyses, u.bucket).map((r) => ({ period: r.date, ecgs_analysed: r.count }));
  if (kind === "csv") downloadCsv("qardix-usage-by-doctor", doctorRows);
  else downloadXlsx("qardix-usage", { "Doctor-wise": doctorRows, "Date-wise": dateRows });
}

export function ExportButtons({ u }: { u: ReturnType<typeof useMmUsage> }) {
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => exportUsage(u, "csv")}><FileText className="mr-1.5 size-4" /> CSV</Button>
      <Button variant="outline" size="sm" onClick={() => exportUsage(u, "xlsx")}><FileSpreadsheet className="mr-1.5 size-4" /> Excel</Button>
    </>
  );
}

export function DoctorUsageTable({ rows }: { rows: ReturnType<typeof useMmUsage>["perDoctor"] }) {
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead><tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
          <th className="px-5 py-2.5 font-medium">Doctor</th><th className="px-3 py-2.5 font-medium">Account</th><th className="px-3 py-2.5 font-medium">ECGs analysed</th><th className="px-3 py-2.5 font-medium">Last analysis</th><th className="px-5 py-2.5 font-medium">Last activity</th>
        </tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.doctor} className="border-b last:border-0">
            <td className="px-5 py-3 font-medium">{r.doctor}</td><td className="px-3 py-3"><StatusBadge status={r.status} /></td>
            <td className="px-3 py-3 font-semibold">{r.total_ecgs}</td><td className="px-3 py-3 text-muted-foreground">{fmtDate(r.last_analysis)}</td><td className="px-5 py-3 text-muted-foreground">{fmtDate(r.last_activity)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function MmDashboard({ session }: { session: SessionInfo }) {
  const u = useMmUsage();
  const now = new Date();
  const month = u.analyses.filter((e) => { const d = new Date(e.created_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;
  const active = u.doctors.filter((d) => d.status === "active").length;
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Programme usage</p>
          <h1 className="text-3xl font-semibold">{session.company?.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2"><Filters u={u} /><ExportButtons u={u} /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Total doctors" value={u.doctors.length} icon={<Users className="size-4" />} />
        <Kpi label="Active doctors" value={active} icon={<UserCheck className="size-4" />} tone="routine" />
        <Kpi label="Inactive doctors" value={u.doctors.length - active} icon={<UserX className="size-4" />} />
        <Kpi label="Total ECGs analysed" value={u.analyses.length} icon={<Activity className="size-4" />} tone="signal" />
        <Kpi label="ECGs this month" value={month} icon={<CalendarDays className="size-4" />} />
      </div>
      <Panel title="Date-wise usage trend" action={<BucketToggle u={u} />}><TrendChart data={u.series} /></Panel>
      <Panel title="Doctor-wise ECG usage"><DoctorUsageTable rows={u.perDoctor} /></Panel>
      <p className="text-xs text-muted-foreground">Marketing view shows aggregate account and usage analytics only. Patient and clinical information is never available in this workspace.</p>
    </div>
  );
}
