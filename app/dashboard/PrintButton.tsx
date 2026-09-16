"use client";

import { useState } from "react";
import { downloadExcel, type ExcelSheet } from "@/lib/exportExcel";
import { saveElementAsPdf } from "@/lib/saveAsPdf";

export default function PrintButton({
  excelFilename,
  excelSheets,
  pdfFilename,
  pdfContentId = "pdf-area",
  extraButtons,
}: {
  excelFilename?: string;
  excelSheets?: ExcelSheet[];
  pdfFilename?: string;
  pdfContentId?: string;
  extraButtons?: React.ReactNode;
}) {
  const [savingPdf, setSavingPdf] = useState(false);

  async function handleSavePdf() {
    if (!pdfFilename || savingPdf) return;
    setSavingPdf(true);
    try {
      await saveElementAsPdf(pdfContentId, pdfFilename);
    } finally {
      setSavingPdf(false);
    }
  }

  return (
    <div className="print:hidden mb-4 flex justify-end gap-2">
      {extraButtons}
      {excelFilename && excelSheets && (
        <button
          onClick={() => downloadExcel(excelFilename, excelSheets)}
          className="rounded-lg bg-green-700 px-4 py-2 text-sm text-white"
        >
          📊 Excel ডাউনলোড
        </button>
      )}
      {pdfFilename && (
        <button
          onClick={handleSavePdf}
          disabled={savingPdf}
          className="rounded-lg bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {savingPdf ? "⏳ তৈরি হচ্ছে..." : "💾 Save as PDF"}
        </button>
      )}
      <button
        onClick={() => window.print()}
        className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white"
      >
        {pdfFilename ? "🖨 Print" : "🖨 PDF ডাউনলোড / Print"}
      </button>
    </div>
  );
}
