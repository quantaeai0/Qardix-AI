import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { adminQuery, type Account } from "@/lib/admin-data";
import { createAccount } from "@/lib/admin.functions";
import { PageHeader, Panel, Sel, StatusBadge, fmtDate } from "@/components/kit";
import { ConfirmToggle } from "@/components/confirm-toggle";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Kind = "doctor" | "marketing_manager";

export function useToggleAccount() {
  const qc = useQueryClient();
  return async (a: Account) => {
    const { error } = await supabase.from("profiles").update({ status: a.status === "active" ? "inactive" : "active" }).eq("id", a.id);
    if (error) return void toast.error(error.message);
    toast.success(`${a.display_name} ${a.status === "active" ? "deactivated" : "activated"}`);
    qc.invalidateQueries({ queryKey: ["admin-core"] });
  };
}

export function AccountsAdmin({ kind }: { kind: Kind }) {
  const { data } = useQuery(adminQuery);
  const [q, setQ] = useState("");
  const [company, setCompany] = useState("all");
  const [status, setStatus] = useState("all");
  const [usage, setUsage] = useState("all");
  const [edit, setEdit] = useState<(Partial<Omit<Account, "company_id">> & { company_id?: string | null | undefined }) | null>(null);
  const toggle = useToggleAccount();
  const companies = data?.companies ?? [];
  const events = data?.events ?? [];
  const count = (id: string) => events.filter((e) => e.doctor_id === id && e.event_type === "analysis_completed").length;
  const rows = (data?.accounts ?? []).filter((a) => a.role === kind
    && (company === "all" || a.company_id === company) && (status === "all" || a.status === status)
    && (a.display_name + a.login_id).toLowerCase().includes(q.toLowerCase())
    && (usage === "all" || (usage === "used" ? count(a.id) > 0 : count(a.id) === 0)));
  const isDoc = kind === "doctor";
  const compName = (id: string | null) => companies.find((c) => c.id === id)?.name ?? "—";
  const compStatus = (id: string | null) => companies.find((c) => c.id === id)?.status;

  return (
    <div>
      <PageHeader title={isDoc ? "Doctors" : "Marketing Managers"} subtitle={isDoc ? "Create doctors under a company and control their access" : "Each Marketing Manager maps to exactly one pharma company"}
        actions={<Button onClick={() => setEdit({ status: "active", company_id: companies[0]?.id })}><Plus className="mr-2 size-4" /> Create {isDoc ? "doctor" : "manager"}</Button>} />
      <Panel>
        <div className="mb-4 flex flex-wrap gap-2">
          <Input placeholder="Search name or login ID" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 max-w-xs" />
          <Sel value={company} onChange={setCompany} opts={[["all", "All companies"], ...companies.map((c) => [c.id, c.name] as [string, string])]} />
          <Sel value={status} onChange={setStatus} opts={[["all", "All statuses"], ["active", "Active"], ["inactive", "Inactive"]]} />
          {isDoc && <Sel value={usage} onChange={setUsage} opts={[["all", "Any usage"], ["used", "Has analyses"], ["unused", "No analyses"]]} />}
        </div>
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-2.5 font-medium">Name</th><th className="px-3 py-2.5 font-medium">Login ID</th><th className="px-3 py-2.5 font-medium">Company</th>
              {isDoc && <th className="px-3 py-2.5 font-medium">Specialty</th>}{isDoc && <th className="px-3 py-2.5 font-medium">ECGs</th>}
              <th className="px-3 py-2.5 font-medium">Last activity</th><th className="px-3 py-2.5 font-medium">Status</th><th className="px-5 py-2.5" />
            </tr></thead>
            <tbody>{rows.map((a) => (
              <tr key={a.id} className="border-b last:border-0">
                <td className="px-5 py-3 font-semibold">{isDoc ? <Link to="/admin/doctors/$id" params={{ id: a.id }} className="hover:text-signal">{a.display_name}</Link> : a.display_name}</td>
                <td className="px-3 py-3 font-mono text-xs">{a.login_id}</td>
                <td className="px-3 py-3">{compName(a.company_id)}{compStatus(a.company_id) === "inactive" && <span className="ml-2 rounded bg-urgent/10 px-1.5 py-0.5 text-[10px] font-semibold text-urgent">Company inactive</span>}</td>
                {isDoc && <td className="px-3 py-3 text-muted-foreground">{a.specialty ?? "—"}</td>}{isDoc && <td className="px-3 py-3 font-semibold">{count(a.id)}</td>}
                <td className="px-3 py-3 text-muted-foreground">{fmtDate(a.last_activity_at)}</td>
                <td className="px-3 py-3"><div className="flex items-center gap-2"><ConfirmToggle active={a.status === "active"} name={a.display_name} warning="Only this account will lose access." onConfirm={() => toggle(a)} /><StatusBadge status={a.status} /></div></td>
                <td className="px-5 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => setEdit(a)}><Pencil className="size-4" /></Button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Panel>
      {edit && <AccountDialog kind={kind} value={edit} companies={companies} onClose={() => setEdit(null)} />}
    </div>
  );
}

const baseSchema = z.object({
  display_name: z.string().trim().min(2, "Name is required").max(120),
  login_id: z.string().trim().email("Login ID must be an email-style ID").max(200),
  company_id: z.string().uuid("Select a company"),
  specialty: z.string().trim().max(120),
  email: z.string().trim().max(200),
  status: z.enum(["active", "inactive"]),
});

function AccountDialog({ kind, value, companies, onClose }: { kind: Kind; value: Partial<Omit<Account, "company_id">> & { company_id?: string | null | undefined }; companies: { id: string; name: string }[]; onClose: () => void }) {
  const qc = useQueryClient();
  const create = useServerFn(createAccount);
  const [f, setF] = useState({
    display_name: value.display_name ?? "", login_id: value.login_id ?? "", company_id: value.company_id ?? "", specialty: value.specialty ?? "",
    email: value.email ?? "", status: value.status ?? "active", temp_password: "",
  });
  const [busy, setBusy] = useState(false);
  const isDoc = kind === "doctor";
  async function save() {
    const p = baseSchema.safeParse(f);
    if (!p.success) return void toast.error(p.error.issues[0]?.message ?? "Invalid input");
    setBusy(true);
    if (value.id) {
      const { error } = await supabase.from("profiles").update({ display_name: p.data.display_name, company_id: p.data.company_id, specialty: p.data.specialty || null, email: p.data.email || null, status: p.data.status }).eq("id", value.id);
      setBusy(false);
      if (error) return void toast.error(error.message);
    } else {
      if (f.temp_password.length < 4) { setBusy(false); return void toast.error("Temporary password must be at least 4 characters"); }
      const res = await create({ data: { ...p.data, role: kind, temp_password: f.temp_password, login_id: p.data.login_id.toLowerCase() } });
      setBusy(false);
      if (!res.ok) return void toast.error(res.error);
    }
    toast.success(value.id ? "Account updated" : "Account created");
    qc.invalidateQueries({ queryKey: ["admin-core"] });
    onClose();
  }
  const fld = (k: keyof typeof f, label: string, req = true, extra?: Record<string, unknown>) => (
    <div className="space-y-1.5"><Label>{label}{req && " *"}</Label><Input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...extra} /></div>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{value.id ? "Edit" : "Create"} {isDoc ? "doctor" : "marketing manager"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label>Company *</Label>
            <select value={f.company_id} onChange={(e) => setF({ ...f, company_id: e.target.value })} className="h-9 w-full rounded-md border bg-card px-3 text-sm">
              <option value="">Select company</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {fld("display_name", isDoc ? "Doctor name" : "Name")}
          {fld("login_id", isDoc ? "Doctor ID / Login ID" : "Login ID", true, { disabled: !!value.id, placeholder: "name@company.com" })}
          {fld("email", "Contact email", false)}
          {isDoc && fld("specialty", "Specialty", false)}
          <div className="space-y-1.5"><Label>Status</Label>
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as "active" })} className="h-9 w-full rounded-md border bg-card px-3 text-sm"><option value="active">Active</option><option value="inactive">Inactive</option></select>
          </div>
          {!value.id && fld("temp_password", "Temporary password", true, { type: "text", placeholder: "e.g. 4 digits" })}
        </div>
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : value.id ? "Save changes" : "Create account"}</Button>
      </DialogContent>
    </Dialog>
  );
}
