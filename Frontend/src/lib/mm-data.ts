import { queryOptions } from "@tanstack/react-query";
import { analyticsApi } from "@/lib/api-client";

export interface MmDoctor {
  id: string;
  display_name: string;
  login_id: string;
  specialty: string | null;
  status: string;
  last_activity_at: string | null;
}

export interface UsageEvent {
  id: string;
  doctor_id: string;
  event_type: string;
  created_at: string;
}

export const mmQuery = queryOptions({
  queryKey: ["mm-usage"],
  queryFn: async () => {
    try {
      const doctors = await analyticsApi.getDoctorUsage();
      const formattedDocs = (doctors || []).map((d: any) => ({
        id: d.doctor_id,
        display_name: d.doctor_name,
        login_id: d.email,
        specialty: d.specialty,
        status: d.status,
        last_activity_at: d.last_activity_at,
      })) as MmDoctor[];

      return { doctors: formattedDocs, events: [] };
    } catch (err) {
      console.error("Failed to load MM query from FastAPI:", err);
      return { doctors: [], events: [] };
    }
  },
});

export type Bucket = "day" | "week" | "month";

export function bucketKey(d: Date, b: Bucket) {
  if (b === "month") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  if (b === "week") {
    const x = new Date(d);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

export function trend<T extends { created_at: string }>(rows: T[], b: Bucket) {
  const m = new Map<string, number>();
  rows.forEach((r) => {
    const k = bucketKey(new Date(r.created_at), b);
    m.set(k, (m.get(k) ?? 0) + 1);
  });
  return [...m.entries()].sort(([a], [c]) => a.localeCompare(c)).map(([date, count]) => ({ date, count }));
}
