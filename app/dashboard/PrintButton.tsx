"use client";

import { downloadExcel, type ExcelSheet } from "@/lib/exportExcel";

export default function PrintButton({
  excelFilename,
  excelSheets,
}: {
  excelFilename?: string;
  excelSheets?: ExcelSheet[];
}) {
  return (
    <div className="print:hidden mb-4 flex justify-end gap-2">
      {excelFilename && excelSheets && (
        <button
          onClick={() => downloadExcel(excelFilename, excelSheets)}
          className="rounded-lg bg-green-700 px-4 py-2 text-sm text-white"
        >
          📊 Excel ডাউনলোড
        </button>
      )}
      <button
        onClick={() => window.print()}
        className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white"
      >
        🖨 PDF ডাউনলোড / Print
      </button>
    </div>
  );
}
