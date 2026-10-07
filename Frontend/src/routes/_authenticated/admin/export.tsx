import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Database, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { adminQuery } from "@/lib/admin-data";
import { downloadCsv, downloadXlsx } from "@/lib/export";
import { PageHeader, Panel, Sel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/admin/export")({
  head: () => ({ meta: [{ title: "Data Export — Qardix AI" }] }),
  component: ExportPage,
});

const SECTIONS = [
  ["companies", "Companies"], ["profiles", "Users"], ["patient_assessments", "Patient Assessments"], ["ecg_records", "ECG Analysis Metadata"],
  ["ai_results", "AI Outputs"], ["doctor_validations", "Doctor Validations"], ["reports", "Reports"], ["usage_events", "Usage Events"],
] as const;
type T = (typeof SECTIONS)[number][0];

function ExportPage() {
  const { data: core } = useQuery(adminQuery);
  const [company, setCompany] = useState("all");
  const [doctor, setDoctor] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [urgency, setUrgency] = useState("all");
  const [vstatus, setVstatus] = useState("all");
  const [busy, setBusy] = useState(false);

  async function fetchSection(t: T) {
    const { data } = await supabase.from(t).select("*");
    let rows = (data ?? []) as any[];
    const dateKey = t === "doctor_validations" ? "validated_at" : t === "reports" ? "generated_at" : "created_at";
    if (company !== "all") rows = rows.filter((r) => (t === "companies" ? r.id : r.company_id) === company);
    if (doctor !== "all" && t !== "companies") rows = rows.filter((r) => (t === "profiles" ? r.id : r.doctor_id) === doctor);
    if (from) rows = rows.filter((r) => r[dateKey] >= from);
    if (to) rows = rows.filter((r) => r[dateKey] <= to + "T23:59:59");
    if (urgency !== "all" && t === "ai_results") rows = rows.filter((r) => r.urgency === urgency);
    if (vstatus !== "all" && t === "doctor_validations") rows = rows.filter((r) => r.status === vstatus);
    if (t === "profiles") {
      const roles = new Map((core?.accounts ?? []).map((a) => [a.id, a.role]));
      rows = rows.map((r) => ({ ...r, role: roles.get(r.id) }));
    }
    return rows;
  }

  async function exportAll() {
    setBusy(true);
    const sheets: Record<string, any[]> = {};
    for (const [t, l] of SECTIONS) sheets[l] = await fetchSection(t);
    downloadXlsx(`qardix-all-data-${new Date().toISOString().slice(0, 10)}`, sheets);
    setBusy(false);
    toast.success("Export ready");
  }

  const doctors = (core?.accounts ?? []).filter((a) => a.role === "doctor");
  return (
    <div className="space-y-6">
      <PageHeader title="Data Export" subtitle="Filterable CSV / Excel exports of all system data. Individual report PDFs are available from Reports."
        actions={<Button onClick={exportAll} disabled={busy}><Database className="mr-2 size-4" /> {busy ? "Preparing…" : "Export All Data"}</Button>} />
      <Panel title="Filters">
        <div className="flex flex-wrap gap-2">
          <Sel value={company} onChange={setCompany} opts={[["all", "All companies"], ...(core?.companies ?? []).map((c) => [c.id, c.name] as [string, string])]} />
          <Sel value={doctor} onChange={setDoctor} opts={[["all", "All doctors"], ...doctors.map((d) => [d.id, d.display_name] as [string, string])]} />
          <Sel value={urgency} onChange={setUrgency} opts={[["all", "Any urgency"], ["routine", "Routine"], ["review_soon", "Review Soon"], ["urgent", "Urgent Review"]]} />
          <Sel value={vstatus} onChange={setVstatus} opts={[["all", "Any analysis status"], ["confirm", "Confirmed"], ["correct", "Corrected"], ["reject", "Rejected"]]} />
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" aria-label="From" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" aria-label="To" />
        </div>
      </Panel>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SECTIONS.map(([t, l]) => (
          <div key={t} className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-card)]">
            <p className="font-semibold">{l}</p>
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="outline" onClick={async () => downloadCsv(t, await fetchSection(t))}><FileText className="mr-1 size-3.5" /> CSV</Button>
              <Button size="sm" variant="outline" onClick={async () => downloadXlsx(t, { [l]: await fetchSection(t) })}><FileSpreadsheet className="mr-1 size-3.5" /> Excel</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
