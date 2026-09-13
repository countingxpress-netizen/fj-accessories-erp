import * as XLSX from "xlsx";

export type ExcelSheet = { name: string; rows: (string | number | null | undefined)[][] };

// ব্রাউজারে সরাসরি .xlsx ডাউনলোড করে — sheet নাম Excel-এর 31-ক্যারেক্টার লিমিটে কাটা হয়।
export function downloadExcel(filename: string, sheets: ExcelSheet[]) {
  const wb = XLSX.utils.book_new();
  sheets.forEach((sheet) => {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  });
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
