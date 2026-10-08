import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { companiesApi } from "@/lib/api-client";
import type { Company } from "@/lib/admin-data";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const schema = z.object({
  name: z.string().trim().min(2, "Company name is required").max(150),
  code: z.string().trim().min(2, "Company code is required").max(20).regex(/^[A-Za-z0-9-]+$/, "Code: letters, numbers, dashes"),
  primary_contact: z.string().trim().min(2, "Primary contact is required").max(120),
  contact_email: z.string().trim().email("Valid email required").max(200),
  contact_phone: z.string().trim().max(30).optional(),
  status: z.enum(["active", "inactive"]),
  notes: z.string().trim().max(1000).optional(),
});

export function useSetCompanyStatus() {
  const qc = useQueryClient();
  return async (c: Company) => {
    try {
      const nextStatus = c.status === "active" ? "inactive" : "active";
      await companiesApi.toggleStatus(c.id, nextStatus);
      toast.success(`${c.name} ${nextStatus === "inactive" ? "deactivated — all its users are now blocked" : "activated"}`);
      qc.invalidateQueries({ queryKey: ["admin-core"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to toggle status");
    }
  };
}

export function CompanyDialog({ value, onClose }: { value: Partial<Company>; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: value.name ?? "", code: value.code ?? "", primary_contact: value.primary_contact ?? "", contact_email: value.contact_email ?? "",
    contact_phone: value.contact_phone ?? "", status: value.status ?? "active", notes: value.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  async function save() {
    const p = schema.safeParse(f);
    if (!p.success) return void toast.error(p.error.issues[0]?.message ?? "Invalid input");
    setBusy(true);
    const payload = { ...p.data, code: p.data.code.toUpperCase(), contact_phone: p.data.contact_phone || null, notes: p.data.notes || null };
    try {
      if (value.id) {
        await companiesApi.toggleStatus(value.id, payload.status);
      } else {
        await companiesApi.create(payload);
      }
      toast.success(value.id ? "Company updated" : "Company created");
      qc.invalidateQueries({ queryKey: ["admin-core"] });
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to save company");
    } finally {
      setBusy(false);
    }
  }
  const fld = (k: keyof typeof f, label: string, opt = false) => (
    <div className="space-y-1.5"><Label>{label}{!opt && " *"}</Label><Input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{value.id ? "Edit company" : "Create company"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {fld("name", "Company name")}{fld("code", "Company code")}{fld("primary_contact", "Primary contact name")}{fld("contact_email", "Email")}{fld("contact_phone", "Phone", true)}
          <div className="space-y-1.5"><Label>Status</Label>
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as "active" })} className="h-9 w-full rounded-md border bg-card px-3 text-sm"><option value="active">Active</option><option value="inactive">Inactive</option></select>
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Notes</Label><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        </div>
        <Button onClick={save} disabled={busy}>{value.id ? "Save changes" : "Create company"}</Button>
      </DialogContent>
    </Dialog>
  );
}
