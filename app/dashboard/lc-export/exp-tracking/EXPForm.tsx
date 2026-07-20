"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ExportInvoice = { id: string; invoice_no: string };

export default function EXPForm({ invoices }: { invoices: ExportInvoice[] }) {
  const [invoiceId, setInvoiceId] = useState("");
  const [expNo, setExpNo] = useState("");
  const [submissionDate, setSubmissionDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!invoiceId || !expNo) { setError("Export Invoice ও EXP No দিন।"); return; }
    setLoading(true);
    const { error } = await supabase.from("exp_tracking").insert({
      export_invoice_id: invoiceId, exp_no: expNo, submission_date: submissionDate, status: "submitted",
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setExpNo("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-2xl">
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-sm text-gray-600 mb-1">Export Invoice</label>
          <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" required>
            <option value="">-- বাছুন --</option>
            {invoices.map((inv) => <option key={inv.id} value={inv.id}>{inv.invoice_no}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">EXP No</label>
          <input value={expNo} onChange={(e) => setExpNo(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Submission Date</label>
          <input type="date" value={submissionDate} onChange={(e) => setSubmissionDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "EXP এন্ট্রি সেভ করুন"}
      </button>
    </form>
  );
}