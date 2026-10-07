import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { adminQuery, type Company } from "@/lib/admin-data";
import { PageHeader, Panel, StatusBadge, fmtDate } from "@/components/kit";
import { ConfirmToggle } from "@/components/confirm-toggle";
import { CompanyDialog, useSetCompanyStatus } from "@/components/company-admin";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/companies/")({
  head: () => ({ meta: [{ title: "Companies — Qardix AI" }] }),
  component: Companies,
});

function Companies() {
  const { data } = useQuery(adminQuery);
  const [edit, setEdit] = useState<Partial<Company> | null>(null);
  const toggle = useSetCompanyStatus();
  const companies = data?.companies ?? [];
  const accounts = data?.accounts ?? [];
  return (
    <div>
      <PageHeader title="Companies" subtitle="Pharma sponsors and their access status" actions={<Button onClick={() => setEdit({ status: "active" })}><Plus className="mr-2 size-4" /> Create company</Button>} />
      <Panel>
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-2.5 font-medium">Company</th><th className="px-3 py-2.5 font-medium">Code</th><th className="px-3 py-2.5 font-medium">Contact</th><th className="px-3 py-2.5 font-medium">MMs / Doctors</th><th className="px-3 py-2.5 font-medium">Created</th><th className="px-3 py-2.5 font-medium">Status</th><th className="px-5 py-2.5" />
            </tr></thead>
            <tbody>{companies.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="px-5 py-3"><Link to="/admin/companies/$id" params={{ id: c.id }} className="font-semibold text-foreground hover:text-signal">{c.name}</Link></td>
                <td className="px-3 py-3 font-mono text-xs">{c.code}</td>
                <td className="px-3 py-3"><p>{c.primary_contact}</p><p className="text-xs text-muted-foreground">{c.contact_email}</p></td>
                <td className="px-3 py-3">{accounts.filter((a) => a.company_id === c.id && a.role === "marketing_manager").length} / {accounts.filter((a) => a.company_id === c.id && a.role === "doctor").length}</td>
                <td className="px-3 py-3 text-muted-foreground">{fmtDate(c.created_at)}</td>
                <td className="px-3 py-3"><div className="flex items-center gap-2"><ConfirmToggle active={c.status === "active"} name={c.name} warning="Every Marketing Manager and Doctor under this company will lose access immediately." onConfirm={() => toggle(c)} /><StatusBadge status={c.status} /></div></td>
                <td className="px-5 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => setEdit(c)}><Pencil className="size-4" /></Button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Panel>
      {edit && <CompanyDialog value={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

