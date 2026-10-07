import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, AlertTriangle, ArrowRight, ClipboardList, FileHeart, HeartPulse, Lock, MessageSquareHeart, ShieldCheck, Stethoscope, Upload, UserCheck } from "lucide-react";
import hero from "@/assets/hero-ecg.jpg";
import { Logo, EcgLine } from "@/components/brand";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Qardix AI — AI-assisted ECG intelligence for doctors" },
      { name: "description", content: "From ECG image to doctor-reviewed insight, urgency and patient guidance in one guided workflow." },
      { property: "og:title", content: "Qardix AI — AI-assisted ECG intelligence for doctors" },
      { property: "og:description", content: "Upload a 12-lead ECG, get AI-assisted findings, urgency and patient guidance — validated by the doctor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const STEPS = [
  { icon: ClipboardList, t: "Enter Clinical Context", d: "Vitals, diabetes status, symptoms and medicines — no patient identifiers." },
  { icon: Upload, t: "Upload ECG", d: "Photograph or upload a standard 12-lead ECG with guided quality checks." },
  { icon: Activity, t: "AI Interpretation", d: "Digitised waveform analysed into structured findings and an urgency flag." },
  { icon: UserCheck, t: "Doctor Validation & Report", d: "Confirm, correct or reject — then issue a branded heart-health report." },
];

const FEATURES = [
  { icon: HeartPulse, t: "AI ECG Summary", d: "Key findings, abnormal leads and supportive confidence in concise clinical cards." },
  { icon: AlertTriangle, t: "Urgency Flag", d: "Routine, Review Soon or Urgent Review — decision support you can overrule." },
  { icon: MessageSquareHeart, t: "Patient-Friendly Explanation", d: "Plain-language summary your patient can understand." },
  { icon: FileHeart, t: "Warning Signs", d: "Clear escalation guidance, reviewed and approved by the doctor." },
  { icon: Stethoscope, t: "Doctor Validation", d: "Mandatory sign-off. Original AI output is kept separate for audit." },
];

function Home() {
  return (
    <div className="min-h-screen bg-background">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <Logo light />
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="hidden text-navy-foreground hover:bg-navy-foreground/10 hover:text-navy-foreground sm:inline-flex"><Link to="/request-demo">Request Demo</Link></Button>
            <Button asChild className="bg-signal text-signal-foreground hover:bg-signal/90"><Link to="/auth">Login</Link></Button>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-navy text-navy-foreground">
        <div className="ecg-grid absolute inset-0 opacity-50" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-32 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:pb-28 lg:pt-40">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-signal/30 bg-signal/10 px-3 py-1 text-xs font-medium text-signal">
              <span className="size-1.5 rounded-full bg-signal animate-pulse-dot" /> Cardiac signal intelligence
            </div>
            <h1 className="mt-6 text-5xl font-semibold leading-[1.05] sm:text-6xl lg:text-7xl">
              Qardix <span className="text-signal">AI</span>
            </h1>
            <p className="mt-5 max-w-xl font-display text-2xl leading-snug text-navy-foreground sm:text-3xl">AI-assisted ECG intelligence for doctors.</p>
            <p className="mt-4 max-w-lg text-base text-navy-foreground/70 sm:text-lg">From ECG image to doctor-reviewed insight, urgency and patient guidance in one guided workflow.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-12 bg-signal px-6 text-signal-foreground hover:bg-signal/90"><Link to="/auth">Login <ArrowRight className="ml-1 size-4" /></Link></Button>
              <Button asChild size="lg" variant="outline" className="h-12 border-navy-foreground/25 bg-transparent px-6 text-navy-foreground hover:bg-navy-foreground/10 hover:text-navy-foreground"><Link to="/request-demo">Request Demo</Link></Button>
            </div>
          </div>
          <div className="relative">
            <div className="overflow-hidden rounded-3xl border border-navy-foreground/10 shadow-[var(--shadow-lift)]">
              <img src={hero} alt="Cardiologist reviewing a 12-lead ECG on a digital display" width={1600} height={1104} className="h-full w-full object-cover" />
            </div>
            <div className="absolute -bottom-6 -left-4 w-64 rounded-2xl border bg-card p-4 text-foreground shadow-[var(--shadow-lift)] sm:-left-8">
              <p className="text-xs text-muted-foreground">Urgency flag</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-semibold"><span className="size-2 rounded-full bg-soon" /> Review Soon</p>
              <EcgLine className="mt-2 h-8 text-signal" />
              <p className="mt-1 text-[11px] text-muted-foreground">Awaiting doctor validation</p>
            </div>
          </div>
        </div>
        <EcgLine animated className="relative h-12 text-signal/40" strokeWidth={1.5} />
      </section>

      <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-signal">How Qardix AI works</p>
        <h2 className="mt-3 max-w-2xl text-4xl font-semibold text-foreground">Four guided steps, one accountable result.</h2>
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.t} className="relative rounded-2xl border bg-card p-6 shadow-[var(--shadow-card)]">
              <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
              <div className="mt-4 grid size-11 place-items-center rounded-xl bg-accent text-accent-foreground"><s.icon className="size-5" /></div>
              <h3 className="mt-5 text-lg font-semibold text-foreground">{s.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y bg-card">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
          <h2 className="max-w-2xl text-4xl font-semibold text-foreground">Everything the doctor needs — nothing the doctor doesn't.</h2>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
            {FEATURES.map((f) => (
              <div key={f.t} className="rounded-2xl border bg-background p-6">
                <f.icon className="size-6 text-signal" />
                <h3 className="mt-4 font-semibold text-foreground">{f.t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-24 sm:px-8 lg:grid-cols-2">
        <div className="rounded-3xl bg-navy p-10 text-navy-foreground">
          <Lock className="size-7 text-signal" />
          <h3 className="mt-5 text-2xl font-semibold">Privacy by design</h3>
          <p className="mt-3 text-navy-foreground/75">No patient name, mobile number, Aadhaar or address is required. Every assessment receives a system-generated anonymous Patient ID. Sponsor analytics are strictly separated from clinical data.</p>
        </div>
        <div className="rounded-3xl border bg-card p-10">
          <ShieldCheck className="size-7 text-signal" />
          <h3 className="mt-5 text-2xl font-semibold text-foreground">Clinical decisions remain with the doctor</h3>
          <p className="mt-3 text-muted-foreground">Qardix AI provides AI-assisted interpretation and decision support only. It does not prescribe, change medication or make autonomous treatment recommendations. Every report requires doctor validation.</p>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:px-8">
          <Logo />
          <p>© {new Date().getFullYear()} Qardix AI. AI-assisted ECG interpretation for clinician review.</p>
        </div>
      </footer>
    </div>
  );
}
