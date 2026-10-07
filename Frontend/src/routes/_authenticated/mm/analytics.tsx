import { createFileRoute } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BucketToggle, ExportButtons, Filters, useMmUsage } from "@/components/mm-usage";
import { PageHeader, Panel } from "@/components/kit";
import { TrendChart } from "@/components/trend-chart";

export const Route = createFileRoute("/_authenticated/mm/analytics")({
  head: () => ({ meta: [{ title: "Usage Analytics — Qardix AI" }] }),
  component: () => {
    const u = useMmUsage();
    return (
      <div className="space-y-6">
        <PageHeader title="Usage Analytics" subtitle="Aggregate ECG analyses — no patient-level data" actions={<ExportButtons u={u} />} />
        <Filters u={u} />
        <Panel title="ECG analyses over time" action={<BucketToggle u={u} />}><TrendChart data={u.series} height={300} /></Panel>
        <Panel title="ECGs by doctor">
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={u.perDoctor} margin={{ left: -20 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="doctor" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="total_ecgs" name="ECGs" fill="var(--navy)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    );
  },
});
