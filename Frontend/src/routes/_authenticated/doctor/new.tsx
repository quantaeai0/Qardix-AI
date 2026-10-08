import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, Download, HeartPulse, ImageUp, Lock, Printer,
  RefreshCw, ShieldCheck, Upload, XCircle,
} from "lucide-react";
import { assessmentApi } from "@/lib/api-client";
import type { EcgAnalysisResult } from "@/lib/mock-ai";
import { downloadReportPdf, loadReportBundle, type ReportBundle } from "@/lib/reports";
import { EcgLine } from "@/components/brand";
import { EcgSample } from "@/components/ecg-sample";
import { ReportView } from "@/components/report-view";
import { Panel, SafetyNote, UrgencyBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/doctor/new")({
  head: () => ({ meta: [{ title: "New ECG Assessment — Qardix AI" }] }),
  component: Wizard,
});

const STEPS = ["Clinical Data", "Symptoms & Medicines", "ECG Upload", "AI Processing", "Results", "Doctor Validation", "Final Report"];
const DIABETES = ["Non-Diabetic", "Prediabetes", "Type 1 Diabetes", "Type 2 Diabetes", "Unknown"];
const COMPLICATIONS = ["Diabetic Kidney Disease", "Neuropathy", "Retinopathy", "Diabetic Foot/Ulcer", "Cardiovascular Disease"];
const SYMPTOMS = [["chest_pain", "Chest Pain"], ["palpitation", "Palpitation"], ["breathlessness", "Breathlessness"], ["syncope", "Syncope / Fainting"]] as const;
const MEDICINES = ["Beta Blocker", "Antiarrhythmic", "Anticoagulant", "Antiplatelet", "Calcium Channel Blocker", "Diabetes Medicine", "Other"];
const STAGES = ["Checking image quality", "Digitizing waveform", "Analysing ECG", "Preparing report"];

const clinicalSchema = z.object({
  age: z.coerce.number().int().min(1, "Age is required").max(120),
  sex: z.enum(["Male", "Female", "Other"], { errorMap: () => ({ message: "Select sex" }) }),
  height_cm: z.coerce.number().min(50, "Height (cm) is required").max(250),
  weight_kg: z.coerce.number().min(10, "Weight (kg) is required").max(300),
  bp_systolic: z.coerce.number().int().min(60, "Systolic BP is required").max(260),
  bp_diastolic: z.coerce.number().int().min(30, "Diastolic BP is required").max(160),
  heart_rate: z.coerce.number().int().min(20, "Heart rate is required").max(250),
  spo2: z.coerce.number().int().min(50, "SpO₂ is required").max(100),
  diabetes_status: z.string().min(1, "Select diabetes status"),
});

type Clinical = Record<keyof z.infer<typeof clinicalSchema>, string>;

function genPatientId() {
  return `QX-P-${Date.now().toString(36).toUpperCase().slice(-5)}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
}

function Wizard() {
  const { session } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [patientId] = useState(genPatientId);
  const [c, setC] = useState<Clinical>({ age: "", sex: "", height_cm: "", weight_kg: "", bp_systolic: "", bp_diastolic: "", heart_rate: "", spo2: "", diabetes_status: "" });
  const [complications, setComplications] = useState<string[]>([]);
  const [symptoms, setSymptoms] = useState<Record<string, boolean | null>>({ chest_pain: null, palpitation: null, breathlessness: null, syncope: null });
  const [meds, setMeds] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [quality, setQuality] = useState<"accepted" | "needs_reupload" | null>(null);
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState<EcgAnalysisResult | null>(null);
  const [ids, setIds] = useState<{ assessment: string; ai: string } | null>(null);
  const [vStatus, setVStatus] = useState<"confirm" | "correct" | "reject" | null>(null);
  const [corrected, setCorrected] = useState("");
  const [notes, setNotes] = useState("");
  const [savingV, setSavingV] = useState(false);
  const [bundle, setBundle] = useState<ReportBundle | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const bmi = useMemo(() => {
    const h = Number(c.height_cm) / 100, w = Number(c.weight_kg);
    return h > 0 && w > 0 ? Math.round((w / (h * h)) * 10) / 10 : null;
  }, [c.height_cm, c.weight_kg]);

  const set = (k: keyof Clinical) => (e: React.ChangeEvent<HTMLInputElement>) => setC({ ...c, [k]: e.target.value });

  function next1() {
    const p = clinicalSchema.safeParse(c);
    if (!p.success) return void toast.error(p.error.issues[0]?.message ?? "Invalid input");
    if (Number(c.bp_diastolic) >= Number(c.bp_systolic)) return void toast.error("Diastolic must be lower than systolic");
    setStep(1);
  }
  function next2() {
    if (Object.values(symptoms).some((v) => v === null)) return void toast.error("Answer Yes or No for every symptom");
    setStep(2);
  }
  function onFile(f: File | undefined) {
    if (!f) return;
    if (!["image/jpeg", "image/png"].includes(f.type)) return void toast.error("Please upload a JPG or PNG image");
    if (f.size > 10 * 1024 * 1024) return void toast.error("Image must be under 10 MB");
    setFile(f);
    setPreview(URL.createObjectURL(f));
    // Demo-mode quality check: very small images are treated as unreadable.
    const img = new Image();
    img.onload = () => setQuality(img.width < 400 || img.height < 250 || f.size < 15 * 1024 ? "needs_reupload" : "accepted");
    img.src = URL.createObjectURL(f);
  }

  async function runAnalysis() {
    setStep(3);
    setStage(0);
    const timer = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 1100);
    try {
      const sym = Object.fromEntries(Object.entries(symptoms).map(([k, v]) => [k, !!v]));
      
      const assessment = await assessmentApi.create({
        age: Number(c.age),
        sex: c.sex,
        height_cm: Number(c.height_cm),
        weight_kg: Number(c.weight_kg),
        bp_systolic: Number(c.bp_systolic),
        bp_diastolic: Number(c.bp_diastolic),
        heart_rate: Number(c.heart_rate),
        spo2: Number(c.spo2),
        diabetes_status: c.diabetes_status,
        diabetic_complications: complications,
        symptoms: sym,
        medicines: meds,
        training_consent: consent,
      });

      const ecgResponse = await assessmentApi.uploadECG(assessment.id, file!);

      const ai = ecgResponse.ai_result;
      if (!ai) {
        throw new Error(ecgResponse.quality_reason || "ECG processing failed");
      }

      const res: EcgAnalysisResult = {
        quality_status: ecgResponse.quality_status,
        model_version: ai.model_version || "DeepECG WCR-77 v2.4",
        ai_summary: ai.ai_summary,
        findings: ai.findings || [],
        confidence: ai.confidence_json?.overall || 0.92,
        abnormal_leads: ai.abnormal_leads || [],
        urgency: ai.urgency,
        patient_explanation: ai.patient_explanation,
        warning_signs: ai.warning_signs || [],
      };

      setIds({ assessment: assessment.id, ai: ai.id });
      setResult(res);
      clearInterval(timer);
      setStage(STAGES.length);
      setTimeout(() => setStep(4), 500);
    } catch (err: any) {
      clearInterval(timer);
      console.error(err);
      toast.error(err.message || "Analysis failed. Please try again.");
      setStep(2);
    }
  }

  async function saveValidation() {
    if (!vStatus) return void toast.error("Select Confirm, Correct or Reject");
    if (vStatus === "correct" && corrected.trim().length < 5) return void toast.error("Enter your final interpretation");
    if (!ids) return;
    setSavingV(true);
    try {
      await assessmentApi.validate(ids.assessment, {
        status: vStatus,
        corrected_interpretation: vStatus === "correct" ? corrected.trim().slice(0, 2000) : undefined,
        notes: notes.trim().slice(0, 2000) || undefined,
      });
      setBundle(await loadReportBundle(ids.assessment));
      qc.invalidateQueries({ queryKey: ["cases"] });
      setSavingV(false);
      setStep(6);
    } catch (err: any) {
      setSavingV(false);
      toast.error(err.message || "Could not save validation");
    }
  }

  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [step]);

  const locked = step >= 3; // cannot go back to edit inputs once analysed

  return (
    <div className="mx-auto max-w-5xl">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">New ECG Assessment</h1>
          <p className="mt-1 text-sm text-muted-foreground">Patient ID <span className="font-mono font-semibold text-foreground">{patientId}</span> · auto-generated</p>
        </div>
      </div>

      {/* Stepper */}
      <ol className="no-print mb-8 grid grid-cols-7 gap-1.5">
        {STEPS.map((s, i) => (
          <li key={s} className="min-w-0">
            <div className={cn("h-1.5 rounded-full transition-colors", i < step ? "bg-signal" : i === step ? "bg-navy" : "bg-border")} />
            <div className="mt-2 flex items-center gap-1.5">
              <span className={cn("grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold", i < step ? "bg-signal text-signal-foreground" : i === step ? "bg-navy text-navy-foreground" : "bg-muted text-muted-foreground")}>
                {i < step ? <Check className="size-3" /> : i + 1}
              </span>
              <span className={cn("hidden truncate text-xs md:block", i === step ? "font-semibold text-foreground" : "text-muted-foreground")}>{s}</span>
            </div>
          </li>
        ))}
      </ol>
      <p className="no-print -mt-5 mb-6 text-xs text-muted-foreground md:hidden">Step {step + 1} of 7 · <span className="font-semibold text-foreground">{STEPS[step]}</span></p>

      {step === 0 && (
        <div className="space-y-6">
          <div className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
            <Lock className="mt-0.5 size-4 shrink-0 text-signal" />
            Qardix AI uses a privacy-by-design workflow and does not require direct patient identifiers for this assessment.
          </div>
          <Panel title="Step 1 · Basic clinical data">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <NumField id="age" label="Age (years)" value={c.age} onChange={set("age")} />
              <div className="space-y-1.5">
                <Label>Sex *</Label>
                <div className="flex gap-1.5">
                  {["Male", "Female", "Other"].map((s) => (
                    <Pill key={s} active={c.sex === s} onClick={() => setC({ ...c, sex: s })}>{s}</Pill>
                  ))}
                </div>
              </div>
              <NumField id="h" label="Height (cm)" value={c.height_cm} onChange={set("height_cm")} />
              <NumField id="w" label="Weight (kg)" value={c.weight_kg} onChange={set("weight_kg")} />
              <div className="space-y-1.5">
                <Label>Blood pressure (mmHg) *</Label>
                <div className="flex items-center gap-1.5">
                  <Input inputMode="numeric" placeholder="Sys" value={c.bp_systolic} onChange={set("bp_systolic")} className="h-11" />
                  <span className="text-muted-foreground">/</span>
                  <Input inputMode="numeric" placeholder="Dia" value={c.bp_diastolic} onChange={set("bp_diastolic")} className="h-11" />
                </div>
              </div>
              <NumField id="hr" label="Heart rate (bpm)" value={c.heart_rate} onChange={set("heart_rate")} />
              <NumField id="spo2" label="SpO₂ (%)" value={c.spo2} onChange={set("spo2")} />
              <div className="space-y-1.5">
                <Label>BMI (auto)</Label>
                <div className="flex h-11 items-center rounded-md border bg-muted px-3 font-semibold">{bmi ?? "—"}</div>
              </div>
            </div>
          </Panel>
          <Panel title="Step 1B · Diabetes status">
            <div className="flex flex-wrap gap-2">
              {DIABETES.map((d) => <Pill key={d} active={c.diabetes_status === d} onClick={() => setC({ ...c, diabetes_status: d })}>{d}</Pill>)}
            </div>
            <p className="mb-2 mt-5 text-sm font-medium">Diabetic complications <span className="font-normal text-muted-foreground">(select any)</span></p>
            <div className="flex flex-wrap gap-2">
              {COMPLICATIONS.map((d) => (
                <Pill key={d} active={complications.includes(d)} onClick={() => setComplications(toggle(complications, d))}>{d}</Pill>
              ))}
            </div>
          </Panel>
          <Nav onNext={next1} />
        </div>
      )}

      {step === 1 && (
        <div className="space-y-6">
          <Panel title="Step 2 · Symptoms">
            <div className="grid gap-3 sm:grid-cols-2">
              {SYMPTOMS.map(([k, l]) => (
                <div key={k} className="flex items-center justify-between rounded-xl border px-4 py-3">
                  <span className="font-medium">{l}</span>
                  <div className="flex gap-1.5">
                    <Pill active={symptoms[k] === true} tone="urgent" onClick={() => setSymptoms({ ...symptoms, [k]: true })}>Yes</Pill>
                    <Pill active={symptoms[k] === false} onClick={() => setSymptoms({ ...symptoms, [k]: false })}>No</Pill>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Current medicines">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {MEDICINES.map((m) => (
                <label key={m} className={cn("flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm", meds.includes(m) && "border-signal bg-accent")}>
                  <input type="checkbox" className="size-4 accent-[var(--signal)]" checked={meds.includes(m)} onChange={() => setMeds(toggle(meds, m))} />
                  {m}
                </label>
              ))}
            </div>
            <label className="mt-5 flex items-start gap-2.5 text-sm text-muted-foreground">
              <input type="checkbox" className="mt-0.5 size-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              Patient has consented to de-identified use of this record for future model improvement (optional, separate purpose).
            </label>
          </Panel>
          <Nav onBack={() => setStep(0)} onNext={next2} />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <Panel title="Step 3 · Upload 12-lead ECG">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              <input ref={camRef} type="file" accept="image/jpeg,image/png" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              {!preview ? (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
                  className="ecg-grid flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-signal/40 px-6 py-14 text-center"
                >
                  <div className="grid size-14 place-items-center rounded-2xl bg-accent text-accent-foreground"><ImageUp className="size-7" /></div>
                  <p className="mt-4 font-semibold">Drag & drop the ECG image here</p>
                  <p className="text-sm text-muted-foreground">JPG or PNG · up to 10 MB</p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    <Button onClick={() => fileRef.current?.click()}><Upload className="mr-2 size-4" /> Upload image</Button>
                    <Button variant="outline" onClick={() => camRef.current?.click()}><Camera className="mr-2 size-4" /> Use camera</Button>
                  </div>
                </div>
              ) : (
                <div>
                  <img src={preview} alt="ECG preview" className="max-h-80 w-full rounded-xl border object-contain" />
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    {quality === "accepted" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-routine/12 px-3 py-1 text-sm font-medium text-routine"><CheckCircle2 className="size-4" /> Quality: Accepted</span>
                    ) : quality === "needs_reupload" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-urgent/10 px-3 py-1 text-sm font-medium text-urgent"><XCircle className="size-4" /> Needs Re-upload — image too small or unclear</span>
                    ) : <span className="text-sm text-muted-foreground">Checking quality…</span>}
                    <Button variant="outline" onClick={() => fileRef.current?.click()}><RefreshCw className="mr-2 size-4" /> Replace Image</Button>
                  </div>
                </div>
              )}
            </Panel>
            <div className="space-y-6">
              <Panel title="Reference · standard 12-lead layout">
                <EcgSample className="w-full rounded-lg border" />
              </Panel>
              <Panel title="Upload guidance">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {["Use a clear, in-focus image", "Keep the ECG paper flat", "Avoid glare and shadows", "Capture the full ECG — all 12 leads", "Use good, even lighting", "Ensure calibration text and grid are visible"].map((g) => (
                    <li key={g} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-signal" />{g}</li>
                  ))}
                </ul>
              </Panel>
            </div>
          </div>
          <Nav onBack={() => setStep(1)} onNext={runAnalysis} nextLabel="Continue" disabled={quality !== "accepted"} />
        </div>
      )}

      {step === 3 && (
        <div className="relative overflow-hidden rounded-3xl bg-navy px-6 py-16 text-center text-navy-foreground">
          <div className="ecg-grid absolute inset-0 opacity-50" />
          <div className="relative mx-auto max-w-lg">
            <HeartPulse className="mx-auto size-10 text-signal animate-pulse-dot" />
            <h2 className="mt-4 text-2xl font-semibold">Analysing ECG</h2>
            <EcgLine animated className="my-8 h-20 text-signal" strokeWidth={2.5} />
            <ul className="space-y-3 text-left">
              {STAGES.map((s, i) => (
                <li key={s} className={cn("flex items-center gap-3 rounded-xl px-4 py-3 transition-colors", i < stage ? "bg-signal/15" : i === stage ? "bg-navy-foreground/10" : "opacity-40")}>
                  {i < stage ? <CheckCircle2 className="size-5 text-signal" /> : <span className={cn("size-5 rounded-full border-2", i === stage ? "border-signal animate-pulse-dot" : "border-navy-foreground/40")} />}
                  <span className="text-sm font-medium">{s}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {step === 4 && result && (
        <div className="space-y-6">
          <SafetyNote />
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title={<span className="flex items-center gap-2"><Tag>Doctor</Tag> AI ECG Summary</span>} className="lg:col-span-2">
              <p className="text-lg font-semibold">{result.ai_summary}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {result.findings.map((f) => (
                  <div key={f.label} className="rounded-xl border bg-background p-3">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{f.label}</p>
                    <p className="mt-1 text-sm font-medium">{f.detail}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-6 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Abnormal leads</p>
                  <div className="mt-1 flex flex-wrap gap-1">{result.abnormal_leads.length ? result.abnormal_leads.map((l) => <span key={l} className="rounded-md bg-urgent/10 px-2 py-0.5 font-mono text-xs text-urgent">{l}</span>) : <span className="text-muted-foreground">None flagged</span>}</div>
                </div>
                <div className="min-w-48">
                  <p className="text-xs text-muted-foreground">Supportive confidence (not certainty)</p>
                  <div className="mt-1.5 flex items-center gap-2"><div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted"><div className="h-full bg-signal" style={{ width: `${result.confidence * 100}%` }} /></div><span className="text-xs font-semibold">{Math.round(result.confidence * 100)}%</span></div>
                </div>
              </div>
            </Panel>
            <Panel title={<span className="flex items-center gap-2"><Tag>Doctor</Tag> Urgency Flag</span>}>
              <UrgencyBadge urgency={result.urgency} size="lg" />
              <p className="mt-3 text-sm text-muted-foreground">Decision support only — you can confirm, correct or reject in the next step.</p>
            </Panel>
            <Panel title={<span className="flex items-center gap-2"><Tag patient>Patient</Tag> Patient-Friendly Explanation</span>}>
              <p className="text-sm leading-relaxed">{result.patient_explanation}</p>
            </Panel>
            <Panel title={<span className="flex items-center gap-2"><Tag patient>Patient</Tag> Warning Signs</span>} className="lg:col-span-2">
              <ul className="grid gap-2 sm:grid-cols-2">
                {result.warning_signs.map((w) => <li key={w} className="flex items-start gap-2 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-urgent" />{w}</li>)}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">Presented to the patient as safety guidance after your review.</p>
            </Panel>
          </div>
          <Nav onNext={() => setStep(5)} nextLabel="Proceed to Doctor Validation" />
        </div>
      )}

      {step === 5 && result && (
        <div className="space-y-6">
          <Panel title="Step 6 · Mandatory doctor validation">
            <p className="mb-4 text-sm text-muted-foreground">AI summary: <span className="font-medium text-foreground">{result.ai_summary}</span></p>
            <div className="grid gap-3 sm:grid-cols-3">
              {([["confirm", "Confirm", "AI output is clinically appropriate", CheckCircle2], ["correct", "Correct", "Provide your final interpretation", RefreshCw], ["reject", "Reject", "AI output is not usable", XCircle]] as const).map(([k, l, d, Icon]) => (
                <button key={k} onClick={() => setVStatus(k)} className={cn("rounded-2xl border-2 p-4 text-left transition", vStatus === k ? "border-signal bg-accent" : "border-border hover:border-signal/50")}>
                  <Icon className={cn("size-5", k === "reject" ? "text-urgent" : "text-signal")} />
                  <p className="mt-2 font-semibold">{l}</p>
                  <p className="text-xs text-muted-foreground">{d}</p>
                </button>
              ))}
            </div>
            {vStatus === "correct" && (
              <div className="mt-5 space-y-1.5">
                <Label htmlFor="corr">Doctor Final Interpretation *</Label>
                <Textarea id="corr" rows={3} maxLength={2000} value={corrected} onChange={(e) => setCorrected(e.target.value)} placeholder="Your corrected ECG interpretation" />
              </div>
            )}
            <div className="mt-5 space-y-1.5">
              <Label htmlFor="notes">Comments / final notes (optional)</Label>
              <Textarea id="notes" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" /> The original AI output is stored separately from your validation for audit.</p>
          </Panel>
          <Nav onBack={() => setStep(4)} onNext={saveValidation} nextLabel={savingV ? "Saving…" : "Save Validation & Generate Report"} disabled={!vStatus || savingV} />
        </div>
      )}

      {step === 6 && bundle && (
        <div className="space-y-6">
          <div className="no-print flex flex-wrap gap-2">
            <Button onClick={() => downloadReportPdf(bundle)}><Download className="mr-2 size-4" /> Download PDF</Button>
            <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 size-4" /> Print</Button>
            <Button variant="outline" asChild><Link to="/doctor"><ArrowLeft className="mr-2 size-4" /> Back to Dashboard</Link></Button>
            <Button variant="outline" onClick={() => navigate({ to: "/doctor/new", reloadDocument: true })}>Start New Assessment</Button>
          </div>
          <ReportView b={bundle} />
        </div>
      )}
      {locked && step < 6 && step !== 3 && <p className="no-print mt-4 text-center text-xs text-muted-foreground">Clinical inputs are locked after analysis for audit integrity.</p>}
    </div>
  );
}

function toggle(arr: string[], v: string) {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function NumField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label} *</Label>
      <Input id={id} inputMode="decimal" value={value} onChange={onChange} className="h-11" />
    </div>
  );
}

function Pill({ active, onClick, children, tone }: { active: boolean; onClick: () => void; children: React.ReactNode; tone?: "urgent" }) {
  return (
    <button type="button" onClick={onClick} className={cn(
      "rounded-full border px-4 py-2 text-sm font-medium transition",
      active ? (tone === "urgent" ? "border-urgent bg-urgent text-destructive-foreground" : "border-navy bg-navy text-navy-foreground") : "bg-card hover:border-signal/60",
    )}>{children}</button>
  );
}

function Tag({ children, patient }: { children: React.ReactNode; patient?: boolean }) {
  return <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", patient ? "bg-soon/15 text-soon" : "bg-accent text-accent-foreground")}>{children}</span>;
}

function Nav({ onBack, onNext, nextLabel = "Continue", disabled }: { onBack?: () => void; onNext: () => void; nextLabel?: string; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      {onBack ? <Button variant="ghost" onClick={onBack}><ArrowLeft className="mr-2 size-4" /> Back</Button> : <span />}
      <Button size="lg" onClick={onNext} disabled={disabled}>{nextLabel} <ArrowRight className="ml-2 size-4" /></Button>
    </div>
  );
}
