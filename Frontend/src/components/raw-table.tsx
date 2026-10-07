import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { adminQuery } from "@/lib/admin-data";
import { downloadCsv, downloadXlsx } from "@/lib/export";
import { Empty, PageHeader, Panel, Sel } from "@/components/kit";
import { Button } from "@/components/ui/button";

export type Col = { key: string; label: string; render?: (row: any, ctx: { name: (id: string) => string; company: (id: string) => string }) => React.ReactNode };

export function RawTable({ table, title, subtitle, cols }: { table: "patient_assessments" | "ecg_records" | "ai_results" | "doctor_validations"; title: string; subtitle: string; cols: Col[] }) {
  const { data: core } = useQuery(adminQuery);
  const { data = [] } = useQuery({
    queryKey: ["raw", table],
    queryFn: async () => (await supabase.from(table).select("*").order(table === "doctor_validations" ? "validated_at" : "created_at", { ascending: false })).data ?? [],
  });
  const [company, setCompany] = useState("all");
  const ctx = {
    name: (id: string) => core?.accounts.find((a) => a.id === id)?.display_name ?? "—",
    company: (id: string) => core?.companies.find((c) => c.id === id)?.name ?? "—",
  };
  const rows = (data as any[]).filter((r) => company === "all" || r.company_id === company);
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} actions={<>
        <Button variant="outline" size="sm" onClick={() => downloadCsv(table, rows)}><FileText className="mr-1.5 size-4" /> CSV</Button>
        <Button variant="outline" size="sm" onClick={() => downloadXlsx(table, { [title]: rows })}><FileSpreadsheet className="mr-1.5 size-4" /> Excel</Button>
      </>} />
      <Panel title={<Sel value={company} onChange={setCompany} opts={[["all", "All companies"], ...(core?.companies ?? []).map((c) => [c.id, c.name] as [string, string])]} />}>
        {rows.length ? (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                {cols.map((c) => <th key={c.key} className="px-4 py-2.5 font-medium first:pl-5">{c.label}</th>)}
              </tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0 align-top">
                  {cols.map((c) => <td key={c.key} className="max-w-[280px] px-4 py-3 first:pl-5">{c.render ? c.render(r, ctx) : String(r[c.key] ?? "—")}</td>)}
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <Empty>No records.</Empty>}
      </Panel>
    </div>
  );
}
