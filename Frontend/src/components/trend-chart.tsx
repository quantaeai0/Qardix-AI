import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function TrendChart({ data, height = 240 }: { data: { date: string; count: number }[]; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
          <defs>
            <linearGradient id="tg" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--signal)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--signal)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
          <Tooltip />
          <Area type="monotone" dataKey="count" name="ECGs" stroke="var(--signal)" strokeWidth={2.5} fill="url(#tg)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
