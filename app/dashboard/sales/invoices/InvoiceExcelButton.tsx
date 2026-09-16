"use client";

import { useState } from "react";
import { downloadInvoiceExcel, type InvoiceExcelParams } from "@/lib/exportInvoiceExcel";

export default function InvoiceExcelButton({ filename, ...params }: InvoiceExcelParams & { filename: string }) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    try {
      await downloadInvoiceExcel({ filename, ...params });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className="rounded-lg bg-green-700 px-4 py-2 text-sm text-white disabled:opacity-50"
    >
      {busy ? "⏳ তৈরি হচ্ছে..." : "📊 Excel ডাউনলোড"}
    </button>
  );
}
