import {
  AlertTriangle, CheckCircle2, HeartPulse, ShieldCheck,
  Activity, TrendingUp, Zap, Clock, Gauge, Star,
} from "lucide-react";
import type { ReportBundle } from "@/lib/reports";
import { SYMPTOM_LABELS, VALIDATION_LABEL } from "@/lib/reports";
import type { ClinicalReport, LeadWiseReview } from "@/lib/mock-ai";
import { Logo } from "@/components/brand";
import { UrgencyBadge, fmtDate } from "@/components/kit";
import { EcgPlaceholder } from "@/components/ecg-sample";
import { cn } from "@/lib/utils";

// ── Small helpers ─────────────────────────────────────────────────────────────

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{v}</p>
    </div>
  );
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("border-t px-6 py-5 sm:px-8", className)}>
      <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-signal">{title}</h3>
      {children}
    </section>
  );
}

function MetricTile({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-xl border bg-card px-3 py-4 text-center shadow-sm">
      <Icon className="size-4 text-signal" />
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-base font-bold text-foreground">{value}</span>
    </div>
  );
}

function DiagPill({ label, tone }: { label: string; tone: string }) {
  const cls = {
    normal: "bg-routine/12 text-routine border-routine/20",
    warning: "bg-soon/12 text-soon border-soon/20",
    urgent: "bg-urgent/10 text-urgent border-urgent/20",
  }[tone] ?? "bg-muted text-muted-foreground";
  return (
    <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", cls)}>{label}</span>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls: Record<string, string> = {
    Normal: "bg-routine/12 text-routine",
    Review: "bg-navy/10 text-navy",
    Attention: "bg-urgent/10 text-urgent",
    Correlate: "bg-soon/12 text-soon",
  };
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", cls[status] ?? "bg-muted text-muted-foreground")}>
      {status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const conf: Record<string, { cls: string; label: string }> = {
    URGENT: { cls: "bg-urgent text-white border-urgent", label: "URGENT" },
    REVIEW_SOON: { cls: "bg-soon text-white border-soon", label: "REVIEW SOON" },
    ROUTINE: { cls: "bg-routine text-white border-routine", label: "ROUTINE" },
  };
  const c = conf[priority] ?? conf.ROUTINE;
  return (
    <span className={cn("inline-flex items-center rounded-lg border px-4 py-2 text-sm font-bold tracking-wide", c.cls)}>
      {c.label}
    </span>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PAGE 1 Component
// ═════════════════════════════════════════════════════════════════════════════

function Page1({ b, cr }: { b: ReportBundle; cr: ClinicalReport | null }) {
  const a = b.assessment;
  const ai = b.ai;

  return (
    <div className="overflow-hidden rounded-3xl border bg-card shadow-[var(--shadow-lift)] print:shadow-none">
      {/* Header */}
      <header className="relative flex flex-wrap items-start justify-between gap-4 bg-navy px-6 py-6 text-navy-foreground sm:px-8">
        <div>
          <Logo light />
          <p className="mt-1.5 text-xs opacity-75">Doctor Clinical Intelligence Report</p>
        </div>
        <div className="text-right text-xs">
          <p className="font-mono opacity-90">{b.report?.report_code ?? "Draft"}</p>
          <p className="opacity-60">Assessment ID: {a.anonymous_patient_id}</p>
          <p className="opacity-60">{fmtDate(b.report?.generated_at ?? a.created_at, true)}</p>
        </div>
        <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-amber-400 px-3 py-0.5 text-[9px] font-bold text-amber-900 uppercase tracking-wider">
          Sample — Not for Clinical Use
        </div>
      </header>

      {/* Hero Diagnostic Card */}
      {ai && (
        <section className="border-b px-6 py-5 sm:px-8">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
            <div>
              {/* Patient one-liner */}
              <p className="mb-3 text-sm font-medium text-muted-foreground">
                {a.age}-year-old {a.sex?.toLowerCase()} &nbsp;·&nbsp;
                {a.diabetes_status} &nbsp;·&nbsp;
                BP {a.bp_systolic}/{a.bp_diastolic} mmHg &nbsp;·&nbsp;
                {a.symptoms?.breathlessness ? "Breathlessness present" : "No breathlessness"}
              </p>
              {/* Diagnostic pills */}
              <div className="flex flex-wrap gap-2">
                {cr?.diagnostic_pills?.map((p) => (
                  <DiagPill key={p.label} label={p.label} tone={p.tone} />
                )) ?? (
                  <DiagPill label={ai.urgency === "urgent" ? "Urgent Review Required" : "AI Analysis Complete"} tone={ai.urgency === "urgent" ? "urgent" : "normal"} />
                )}
              </div>
              {/* Impression */}
              <p className="mt-3 text-sm leading-relaxed text-foreground">
                {cr?.ecg_impression ?? ai.ai_summary}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Abnormal leads: {ai.abnormal_leads?.join(", ") || "None flagged"}&nbsp; · &nbsp;
                Overall AI confidence: {cr?.overall_confidence ?? `${Math.round((ai.confidence_json?.overall ?? 0) * 100)}%`}
              </p>
            </div>
            {/* Priority callout */}
            <div className="flex flex-col items-end gap-2 lg:min-w-48">
              <PriorityBadge priority={cr?.clinical_priority ?? ai.urgency.toUpperCase()} />
              {cr?.clinical_priority_reason && (
                <p className="max-w-52 text-right text-xs text-muted-foreground">
                  {cr.clinical_priority_reason}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 6 Quantitative Metric Tiles */}
      {cr?.quantitative_metrics && (
        <section className="border-b px-6 py-5 sm:px-8">
          <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-signal">
            Quantitative ECG Measurements
          </h3>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            <MetricTile label="Heart Rate" value={`${cr.quantitative_metrics.heart_rate_bpm} bpm`} icon={HeartPulse} />
            <MetricTile label="PR Interval" value={`${cr.quantitative_metrics.pr_interval_ms} ms`} icon={Clock} />
            <MetricTile label="QRS Duration" value={`${cr.quantitative_metrics.qrs_duration_ms} ms`} icon={Activity} />
            <MetricTile label="QT / QTc" value={`${cr.quantitative_metrics.qt_ms} / ${cr.quantitative_metrics.qtc_ms} ms`} icon={TrendingUp} />
            <MetricTile label="Elec. Axis" value={cr.quantitative_metrics.electrical_axis_deg} icon={Zap} />
            <MetricTile label="ECG Quality" value={cr.quantitative_metrics.ecg_quality_text} icon={Gauge} />
          </div>
        </section>
      )}

      {/* ECG Waveform Preview */}
      <Section title="ECG Waveform Preview">
        {b.digitisedPlotUrl ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Digitized 12-Lead Waveform Reconstruction</span>
              {b.ai?.lead_quality && (
                <span className="rounded bg-signal/10 px-2 py-0.5 font-mono text-[11px] text-signal font-medium">
                  Digitisation Quality: {b.ai.lead_quality.level.toUpperCase()} ({b.ai.lead_quality.independent_measured}/{b.ai.lead_quality.of} leads)
                </span>
              )}
            </div>
            <img
              src={b.digitisedPlotUrl}
              alt="Digitized 12-lead ECG waveform"
              className="max-h-96 w-full rounded-xl border bg-white object-contain shadow-sm"
            />
            {b.imageUrl && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer font-medium hover:text-foreground">
                  View Original Uploaded Image
                </summary>
                <img
                  src={b.imageUrl}
                  alt="Original uploaded ECG"
                  className="mt-2 max-h-80 w-full rounded-xl border object-contain"
                />
              </details>
            )}
          </div>
        ) : b.imageUrl ? (
          <img src={b.imageUrl} alt="Uploaded 12-lead ECG" className="max-h-80 w-full rounded-xl border object-contain" />
        ) : (
          <EcgPlaceholder label="Demo record — ECG waveform reference" />
        )}
        <p className="mt-2 text-[10px] text-muted-foreground">
          Illustrative preview only. Refer to original tracing for clinical verification.
        </p>
      </Section>

      {/* Patient & Clinical Snapshot (3 columns) */}
      <Section title="Patient & Clinical Snapshot">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-signal">Patient Details</p>
            <Field k="Anonymous ID" v={<span className="font-mono">{a.anonymous_patient_id}</span>} />
            <Field k="Age / Sex" v={`${a.age} y · ${a.sex}`} />
            <Field k="Height / Weight" v={`${a.height_cm} cm · ${a.weight_kg} kg`} />
            <Field k="BMI" v={a.bmi ?? "—"} />
          </div>
          <div className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-signal">Vitals</p>
            <Field k="Blood Pressure" v={`${a.bp_systolic}/${a.bp_diastolic} mmHg`} />
            <Field k="Heart Rate" v={`${a.heart_rate} bpm`} />
            <Field k="SpO₂" v={`${a.spo2}%`} />
          </div>
          <div className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-signal">Clinical Context</p>
            <Field k="Diabetes" v={a.diabetes_status} />
            {Object.entries(a.symptoms ?? {}).map(([k, v]) => (
              <Field key={k} k={SYMPTOM_LABELS[k] ?? k} v={
                <span className={v ? "text-urgent" : "text-muted-foreground"}>{v ? "Present" : "Absent"}</span>
              } />
            ))}
          </div>
        </div>
      </Section>

      {/* Top AI Findings Table */}
      {cr?.top_ai_findings?.length ? (
        <Section title="Top AI Findings">
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy text-navy-foreground">
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider">#</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider">AI Finding</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider">Lead / Region</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider">Confidence</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider">Doctor Review</th>
                </tr>
              </thead>
              <tbody>
                {cr.top_ai_findings.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-muted/30" : "bg-background"}>
                    <td className="px-3 py-2.5 font-bold text-signal">{row.priority}</td>
                    <td className="px-3 py-2.5 font-medium">{row.ai_finding}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{row.lead_region}</td>
                    <td className="px-3 py-2.5 text-xs">{row.confidence}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.doctor_review}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : b.ai && (
        <Section title="AI ECG Summary · AI-assisted, requires doctor review">
          <p className="flex items-start gap-2 text-base font-semibold text-foreground">
            <HeartPulse className="mt-0.5 size-5 shrink-0 text-signal" />
            {b.ai.ai_summary}
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {(b.ai.findings ?? []).map((f: any) => (
              <li key={f.label} className="rounded-xl bg-muted px-3 py-2 text-sm">
                <span className="font-semibold">{f.label}:</span> {f.detail}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Findings Requiring Attention */}
      {cr?.findings_requiring_attention?.length ? (
        <Section title="Findings Requiring Attention">
          <div className="grid gap-4 sm:grid-cols-2">
            {cr.findings_requiring_attention.map((card, i) => (
              <div key={i} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="mb-2 font-bold text-amber-800">{card.title}</p>
                <p className="text-sm leading-relaxed text-amber-900">{card.description}</p>
              </div>
            ))}
          </div>
        </Section>
      ) : b.ai && (
        <>
          <Section title="Warning Signs · reviewed by your doctor">
            <ul className="space-y-1.5">
              {(b.ai.warning_signs ?? []).map((w: string) => (
                <li key={w} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-urgent" />{w}
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PAGE 2 Component
// ═════════════════════════════════════════════════════════════════════════════

function Page2({ b, cr }: { b: ReportBundle; cr: ClinicalReport | null }) {
  const a = b.assessment;

  return (
    <div className="overflow-hidden rounded-3xl border bg-card shadow-[var(--shadow-lift)] print:shadow-none">
      {/* P2 Header */}
      <header className="flex flex-wrap items-start justify-between gap-4 bg-navy px-6 py-6 text-navy-foreground sm:px-8">
        <div>
          <Logo light />
          <p className="mt-1.5 text-xs opacity-75">Clinical Review & Doctor Validation</p>
        </div>
        <div className="text-right text-xs opacity-75">
          <p>Patient: {a.anonymous_patient_id}</p>
          <p>Report: {b.report?.report_code ?? "Draft"}</p>
        </div>
      </header>

      {/* Lead-wise Review Table */}
      {cr?.lead_wise_review?.length ? (
        <Section title="Lead-wise Review Table">
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-signal text-white">
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider">Lead Group</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider">AI Observation</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {cr.lead_wise_review.map((row: LeadWiseReview, i: number) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-muted/30" : "bg-background"}>
                    <td className="px-3 py-3 font-bold text-navy">{row.lead_group}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{row.ai_observation}</td>
                    <td className="px-3 py-3"><StatusPill status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      {/* Clinical Correlation Matrix */}
      {cr?.clinical_correlations?.length ? (
        <Section title="Clinical Correlation Matrix">
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-700 text-white">
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider">Clinical Factor</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider">Current Data</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider">Why it Matters</th>
                </tr>
              </thead>
              <tbody>
                {cr.clinical_correlations.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-muted/30" : "bg-background"}>
                    <td className="px-3 py-3 font-bold text-navy">{row.clinical_factor}</td>
                    <td className="px-3 py-3 font-mono text-xs">{row.current_data}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{row.why_it_matters}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      {/* Prior ECG & Medicines */}
      <Section title="Previous ECG Comparison & Current Medications">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border bg-blue-50 p-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-blue-700">Prior ECG Comparison</p>
            {cr?.previous_ecg_comparison ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Date: {cr.previous_ecg_comparison.prior_ecg_date ?? "No prior ECG"}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed">{cr.previous_ecg_comparison.comparison_note}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No prior ECG on file.</p>
            )}
          </div>
          <div className="rounded-xl border bg-green-50 p-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-green-700">Current Medications</p>
            {a.medicines?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {a.medicines.map((m: string) => (
                  <span key={m} className="rounded-full bg-green-600 px-2.5 py-0.5 text-[11px] font-bold text-white">{m}</span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No medicines recorded.</p>
            )}
          </div>
        </div>
      </Section>

      {/* Red Flag Review Banner */}
      {cr?.red_flag_review && (
        <section className="border-t px-6 py-4 sm:px-8">
          <div className={cn(
            "flex items-start gap-3 rounded-xl border p-4",
            cr.clinical_priority === "URGENT"
              ? "border-urgent/30 bg-urgent/5 text-urgent"
              : "border-blue-200 bg-blue-50 text-blue-800"
          )}>
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-bold">{cr.red_flag_review.status}</p>
              <p className="mt-1 text-sm">{cr.red_flag_review.summary}</p>
            </div>
          </div>
        </section>
      )}

      {/* Doctor Validation */}
      <Section title="Doctor Validation & Final Interpretation">
        {b.validation ? (
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="size-4 text-signal" />
              {VALIDATION_LABEL[b.validation.status]} · {fmtDate(b.validation.validated_at, true)}
            </p>
            {b.validation.corrected_interpretation && (
              <div className="rounded-xl border bg-muted/40 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Doctor Final Interpretation</p>
                <p className="mt-1">{b.validation.corrected_interpretation}</p>
              </div>
            )}
            {b.validation.notes && (
              <div className="rounded-xl border bg-muted/40 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</p>
                <p className="mt-1">{b.validation.notes}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {[["confirm", "Confirm AI findings"], ["correct", "Correct AI findings"], ["reject", "Reject AI interpretation"]].map(([k, label]) => (
              <div key={k} className="flex items-start gap-2.5 rounded-xl border px-4 py-3">
                <div className="mt-0.5 size-4 shrink-0 rounded border-2 border-muted-foreground" />
                <span className="text-sm text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Patient Communication Summary */}
      {cr?.patient_communication_summary && (
        <Section title="Patient Communication Summary (Doctor Reference)">
          <div className="rounded-xl border bg-blue-50 px-4 py-3">
            <p className="text-sm leading-relaxed text-blue-900">{cr.patient_communication_summary}</p>
          </div>
        </Section>
      )}

      {/* Audit Box */}
      <Section title="Finalisation & Audit">
        <div className="grid grid-cols-2 gap-4 rounded-xl border bg-muted/30 px-4 py-4 sm:grid-cols-3">
          <Field k="Doctor" v={b.doctor?.display_name ?? "—"} />
          <Field k="Specialty" v={b.doctor?.specialty ?? "—"} />
          <Field k="Company" v={b.company?.name ?? "—"} />
          <Field k="Validated On" v={b.validation?.validated_at ? fmtDate(b.validation.validated_at, true) : "Pending"} />
          <Field k="Final Status" v={b.validation ? (VALIDATION_LABEL[b.validation.status] ?? b.validation.status) : "Pending Review"} />
          <Field k="Report Version" v="QDX-DoctorReport-v2.0" />
        </div>
      </Section>

      {/* Disclaimer + Footer */}
      <footer className="border-t bg-muted/50 px-6 py-5 sm:px-8">
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
          AI-assisted ECG interpretation. This report is a clinical decision-support tool only. Final clinical
          interpretation and management decisions remain the sole responsibility of the treating doctor.
        </p>
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          Powered by QUANTAE TECHNOLOGY &nbsp;|&nbsp; Qardix AI &nbsp;|&nbsp; Doctor Report &nbsp;|&nbsp; Page 2 of 2
        </p>
      </footer>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Main exported ReportView — renders both pages
// ═════════════════════════════════════════════════════════════════════════════

export function ReportView({ b }: { b: ReportBundle }) {
  const cr: ClinicalReport | null = b.ai?.clinical_report ?? null;
  return (
    <div className="space-y-8">
      <Page1 b={b} cr={cr} />
      <Page2 b={b} cr={cr} />
    </div>
  );
}
