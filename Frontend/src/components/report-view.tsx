import { AlertTriangle, CheckCircle2, HeartPulse, ShieldCheck } from "lucide-react";
import type { ReportBundle } from "@/lib/reports";
import { SYMPTOM_LABELS, VALIDATION_LABEL } from "@/lib/reports";
import { Logo } from "@/components/brand";
import { UrgencyBadge, fmtDate } from "@/components/kit";
import { EcgPlaceholder } from "@/components/ecg-sample";

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{v}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t px-6 py-5 sm:px-8">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-signal">{title}</h3>
      {children}
    </section>
  );
}

export function ReportView({ b }: { b: ReportBundle }) {
  const a = b.assessment;
  return (
    <article className="overflow-hidden rounded-3xl border bg-card shadow-[var(--shadow-lift)] print:shadow-none">
      <header className="flex flex-wrap items-center justify-between gap-4 bg-navy px-6 py-6 text-navy-foreground sm:px-8">
        <div>
          <Logo light />
          <p className="mt-2 text-sm opacity-75">Heart-Health ECG Report</p>
        </div>
        <div className="text-right text-sm">
          <p className="font-mono">{b.report?.report_code ?? "Draft"}</p>
          <p className="opacity-75">{fmtDate(b.report?.generated_at ?? a.created_at, true)}</p>
        </div>
      </header>

      <Section title="Patient & clinical data">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Field k="Anonymous Patient ID" v={<span className="font-mono">{a.anonymous_patient_id}</span>} />
          <Field k="Age / Sex" v={`${a.age} y · ${a.sex}`} />
          <Field k="Height / Weight" v={`${a.height_cm} cm · ${a.weight_kg} kg`} />
          <Field k="BMI" v={a.bmi ?? "—"} />
          <Field k="Blood pressure" v={`${a.bp_systolic}/${a.bp_diastolic} mmHg`} />
          <Field k="Heart rate" v={`${a.heart_rate} bpm`} />
          <Field k="SpO₂" v={`${a.spo2}%`} />
          <Field k="Diabetes" v={a.diabetes_status} />
          <Field k="Complications" v={a.diabetic_complications?.join(", ") || "None"} />
        </div>
      </Section>

      <Section title="Symptoms & medicines">
        <div className="flex flex-wrap gap-2">
          {Object.entries(a.symptoms ?? {}).map(([k, v]) => (
            <span key={k} className={`rounded-full px-3 py-1 text-xs font-medium ${v ? "bg-urgent/10 text-urgent" : "bg-muted text-muted-foreground"}`}>
              {SYMPTOM_LABELS[k] ?? k}: {v ? "Yes" : "No"}
            </span>
          ))}
        </div>
        <p className="mt-3 text-sm text-foreground"><span className="text-muted-foreground">Current medicines: </span>{a.medicines?.join(", ") || "None"}</p>
      </Section>

      <Section title="ECG image">
        {b.imageUrl ? <img src={b.imageUrl} alt="Uploaded 12-lead ECG" className="max-h-80 w-full rounded-xl border object-contain" /> : <EcgPlaceholder label="Demo record — ECG image reference not stored" />}
      </Section>

      {b.ai && (
        <>
          <Section title="AI ECG summary · AI-assisted, requires doctor review">
            <p className="flex items-start gap-2 text-base font-semibold text-foreground"><HeartPulse className="mt-0.5 size-5 shrink-0 text-signal" />{b.ai.ai_summary}</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {(b.ai.findings ?? []).map((f: any) => (
                <li key={f.label} className="rounded-xl bg-muted px-3 py-2 text-sm"><span className="font-semibold">{f.label}:</span> {f.detail}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">Abnormal leads: {b.ai.abnormal_leads?.join(", ") || "None flagged"} · Supportive confidence {Math.round((b.ai.confidence_json?.overall ?? 0) * 100)}%</p>
          </Section>
          <Section title="Urgency flag · decision support">
            <UrgencyBadge urgency={b.ai.urgency} size="lg" />
          </Section>
          <Section title="Patient-friendly explanation">
            <p className="text-sm leading-relaxed text-foreground">{b.ai.patient_explanation}</p>
          </Section>
          <Section title="Warning signs · reviewed by your doctor">
            <ul className="space-y-1.5">
              {(b.ai.warning_signs ?? []).map((w: string) => (
                <li key={w} className="flex items-start gap-2 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-urgent" />{w}</li>
              ))}
            </ul>
          </Section>
        </>
      )}

      <Section title="Doctor validation">
        {b.validation ? (
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-signal" /> {VALIDATION_LABEL[b.validation.status]} · {fmtDate(b.validation.validated_at, true)}</p>
            {b.validation.corrected_interpretation && <p><span className="text-muted-foreground">Doctor final interpretation: </span>{b.validation.corrected_interpretation}</p>}
            {b.validation.notes && <p><span className="text-muted-foreground">Notes: </span>{b.validation.notes}</p>}
          </div>
        ) : <p className="text-sm text-soon">Pending doctor validation</p>}
      </Section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/50 px-6 py-5 text-sm sm:px-8">
        <div>
          <p className="font-semibold text-foreground">{b.doctor?.display_name}{b.doctor?.specialty ? ` · ${b.doctor.specialty}` : ""}</p>
          <p className="text-muted-foreground">{b.company?.name}</p>
        </div>
        <p className="flex max-w-md items-start gap-2 text-xs text-muted-foreground"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />AI-assisted ECG interpretation. Final clinical interpretation and decision remain with the treating doctor.</p>
      </footer>
    </article>
  );
}
