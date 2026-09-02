"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";
import { getCurrentUserId } from "@/lib/currentUser";

type LC = { id: string; lc_no: string };
type Customer = { id: string; name: string };

export default function ExportInvoiceForm({ lcs, customers }: { lcs: LC[]; customers: Customer[] }) {
  const [lcId, setLcId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!customerId || !amount) { setError("Customer ও Amount দিন।"); return; }
    setLoading(true);

    const invoiceNo = await generateNextDocNo(supabase, "export_invoices", "invoice_no", "EXPINV", "invoice_date", invoiceDate);
    const createdBy = await getCurrentUserId(supabase);

    const { error } = await supabase.from("export_invoices").insert({
      invoice_no: invoiceNo, lc_id: lcId || null, customer_id: customerId,
      invoice_date: invoiceDate, amount: parseFloat(amount), created_by: createdBy,
    });

    setLoading(false);
    if (error) { setError(error.message); return; }
    setAmount("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-2xl">
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-sm text-gray-600 mb-1">Customer</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" required>
            <option value="">-- বাছুন --</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-sm text-gray-600 mb-1">Linked LC (ঐচ্ছিক)</label>
          <select value={lcId} onChange={(e) => setLcId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
            <option value="">-- বাছুন --</option>
            {lcs.map((l) => <option key={l.id} value={l.id}>{l.lc_no}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Invoice Date</label>
          <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Amount</label>
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-40" required />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "Export Invoice সেভ করুন"}
      </button>
    </form>
  );
}