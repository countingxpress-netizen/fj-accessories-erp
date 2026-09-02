"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/currentUser";

type ExportInvoice = { id: string; invoice_no: string };

export default function PackingListForm({ invoices }: { invoices: ExportInvoice[] }) {
  const [invoiceId, setInvoiceId] = useState("");
  const [cartons, setCartons] = useState("");
  const [netWeight, setNetWeight] = useState("");
  const [grossWeight, setGrossWeight] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!invoiceId || !cartons) { setError("Export Invoice ও Cartons দিন।"); return; }
    setLoading(true);
    const createdBy = await getCurrentUserId(supabase);
    const { error } = await supabase.from("packing_lists").insert({
      export_invoice_id: invoiceId, total_cartons: parseInt(cartons),
      total_net_weight: parseFloat(netWeight) || 0, total_gross_weight: parseFloat(grossWeight) || 0,
      created_by: createdBy,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setCartons(""); setNetWeight(""); setGrossWeight("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-2xl">
      <div>
        <label className="block text-sm text-gray-600 mb-1">Export Invoice</label>
        <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" required>
          <option value="">-- বাছুন --</option>
          {invoices.map((inv) => <option key={inv.id} value={inv.id}>{inv.invoice_no}</option>)}
        </select>
      </div>
      <div className="flex gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Total Cartons</label>
          <input type="number" value={cartons} onChange={(e) => setCartons(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-32" required />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Net Weight (Kg)</label>
          <input type="number" step="0.01" value={netWeight} onChange={(e) => setNetWeight(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-32" />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Gross Weight (Kg)</label>
          <input type="number" step="0.01" value={grossWeight} onChange={(e) => setGrossWeight(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-32" />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "Packing List সেভ করুন"}
      </button>
    </form>
  );
}