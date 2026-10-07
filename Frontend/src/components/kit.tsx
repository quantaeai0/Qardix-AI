import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { URGENCY_LABEL, type Urgency } from "@/lib/mock-ai";
import { AlertTriangle, CheckCircle2, Clock, ShieldCheck } from "lucide-react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-5 shadow-[var(--shadow-card)]", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title && <h3 className="text-sm font-semibold text-foreground">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, hint, tone = "default", icon }: { label: string; value: ReactNode; hint?: string; tone?: "default" | "signal" | "urgent" | "soon" | "routine"; icon?: ReactNode }) {
  const toneCls = {
    default: "bg-muted text-foreground",
    signal: "bg-accent text-accent-foreground",
    urgent: "bg-urgent/10 text-urgent",
    soon: "bg-soon/15 text-soon",
    routine: "bg-routine/12 text-routine",
  }[tone];
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        {icon && <div className={cn("grid size-8 place-items-center rounded-lg", toneCls)}>{icon}</div>}
      </div>
      <p className="mt-3 font-display text-3xl font-semibold text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function UrgencyBadge({ urgency, size = "sm" }: { urgency: string; size?: "sm" | "lg" }) {
  const u = urgency as Urgency;
  const cls = {
    routine: "bg-routine/12 text-routine border-routine/30",
    review_soon: "bg-soon/15 text-soon border-soon/40",
    urgent: "bg-urgent/10 text-urgent border-urgent/30",
  }[u] ?? "bg-muted text-muted-foreground";
  const Icon = u === "urgent" ? AlertTriangle : u === "review_soon" ? Clock : CheckCircle2;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border font-medium", cls, size === "lg" ? "px-4 py-2 text-base" : "px-2.5 py-0.5 text-xs")}>
      <Icon className={size === "lg" ? "size-5" : "size-3.5"} />
      {URGENCY_LABEL[u] ?? urgency}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const active = status === "active";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", active ? "bg-routine/12 text-routine" : "bg-muted text-muted-foreground")}>
      <span className={cn("size-1.5 rounded-full", active ? "bg-routine" : "bg-muted-foreground")} />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export function ValidationBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-xs text-soon">Pending</span>;
  const map: Record<string, string> = { confirm: "Confirmed", correct: "Corrected", reject: "Rejected" };
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
      <ShieldCheck className="size-3.5 text-signal" /> {map[status] ?? status}
    </span>
  );
}

export function SafetyNote({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border border-signal/30 bg-accent/60 px-4 py-3 text-sm text-accent-foreground", className)}>
      <ShieldCheck className="mt-0.5 size-4 shrink-0" />
      <p>AI-assisted ECG interpretation. Final clinical interpretation and decision remain with the treating doctor.</p>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</div>;
}

export function fmtDate(d: string | null | undefined, withTime = false) {
  if (!d) return "—";
  const dt = new Date(d);
  return withTime
    ? dt.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function Sel({ value, onChange, opts }: { value: string; onChange: (v: string) => void; opts: [string, string][] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-md border bg-card px-3 text-sm">
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
