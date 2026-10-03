import * as XLSX from "xlsx";
import { saveErpFile } from "@/lib/erpDownload";

export type ExcelSheet = { name: string; rows: (string | number | null | undefined)[][] };

// .xlsx ডাউনলোড (D:\000.ERP-এ অটো সেভ, lib/erpDownload.ts) — sheet নাম Excel-এর 31-ক্যারেক্টার লিমিটে কাটা হয়।
export async function downloadExcel(filename: string, sheets: ExcelSheet[]) {
  const wb = XLSX.utils.book_new();
  sheets.forEach((sheet) => {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  });
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  await saveErpFile(blob, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
