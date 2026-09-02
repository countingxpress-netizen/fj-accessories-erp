"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/currentUser";

type Bank = { id: string; bank_name: string };
type Customer = { id: string; name: string };
type Supplier = { id: string; name: string };
type PI = { id: string; pi_no: string };

export default function LCForm({ banks, customers, suppliers, pis }: { banks: Bank[]; customers: Customer[]; suppliers: Supplier[]; pis: PI[] }) {
  const [lcType, setLcType] = useState<"import" | "export">("export");
  const [lcNo, setLcNo] = useState("");
  const [bankId, setBankId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [piId, setPiId] = useState("");
  const [lcDate, setLcDate] = useState(new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!lcNo || !bankId || !amount) { setError("LC No, Bank ও Amount দিন।"); return; }
    setLoading(true);

    const createdBy = await getCurrentUserId(supabase);
    const { error } = await supabase.from("lc_register").insert({
      lc_type: lcType, lc_no: lcNo, bank_id: bankId,
      customer_id: lcType === "export" ? customerId || null : null,
      supplier_id: lcType === "import" ? supplierId || null : null,
      lc_date: lcDate, expiry_date: expiryDate || null,
      amount: parseFloat(amount), currency,
      linked_pi_id: piId || null, status: "active",
      created_by: createdBy,
    });

    if (!error && piId) {
      await supabase.from("proforma_invoices").update({ status: "lc_opened" }).eq("id", piId);
    }

    setLoading(false);
    if (error) { setError(error.message); return; }
    setLcNo(""); setAmount("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-2xl">
      <div className="flex gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">LC Type</label>
          <select value={lcType} onChange={(e) => setLcType(e.target.value as any)} className="rounded-lg border px-3 py-2 text-sm">
            <option value="export">Export LC</option>
            <option value="import">Import LC</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-sm text-gray-600 mb-1">LC No</label>
          <input value={lcNo} onChange={(e) => setLcNo(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Bank</label>
          <select value={bankId} onChange={(e) => setBankId(e.target.value)} className="rounded-lg border px-3 py-2 text-sm min-w-[160px]" required>
            <option value="">-- বাছুন --</option>
            {banks.map((b) => <option key={b.id} value={b.id}>{b.bank_name}</option>)}
          </select>
        </div>
      </div>

      {lcType === "export" ? (
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm text-gray-600 mb-1">Customer</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
              <option value="">-- বাছুন --</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm text-gray-600 mb-1">Linked PI (ঐচ্ছিক)</label>
            <select value={piId} onChange={(e) => setPiId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
              <option value="">-- বাছুন --</option>
              {pis.map((p) => <option key={p.id} value={p.id}>{p.pi_no}</option>)}
            </select>
          </div>
        </div>
      ) : (
        <div>
          <label className="block text-sm text-gray-600 mb-1">Supplier</label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
            <option value="">-- বাছুন --</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">LC Date</label>
          <input type="date" value={lcDate} onChange={(e) => setLcDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Expiry Date</label>
          <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Amount</label>
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-32" required />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Currency</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="BDT">BDT</option>
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "LC সেভ করুন"}
      </button>
    </form>
  );
}