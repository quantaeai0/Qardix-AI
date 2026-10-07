import * as XLSX from "xlsx";

type Row = Record<string, unknown>;

function flat(v: unknown): string | number | boolean | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v.join("; ");
  if (typeof v === "object") return JSON.stringify(v);
  return v as string | number | boolean;
}

export function normalize(rows: Row[]) {
  return rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, flat(v)])));
}

export function downloadCsv(filename: string, rows: Row[]) {
  const ws = XLSX.utils.json_to_sheet(normalize(rows));
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  trigger(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

export function downloadXlsx(filename: string, sheets: Record<string, Row[]>) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.json_to_sheet(rows.length ? normalize(rows) : [{ info: "No records" }]);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

function trigger(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
