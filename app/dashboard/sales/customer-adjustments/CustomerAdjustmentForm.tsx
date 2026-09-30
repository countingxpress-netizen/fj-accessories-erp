"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/currentUser";
import { createCustomerAdjustment, type AdjustmentDirection } from "@/lib/customerAdjustment";

type Customer = { id: string; name: string };
type Account = { id: string; account_code: string; account_name: string; account_type: string };

export default function CustomerAdjustmentForm({ customers, accounts }: { customers: Customer[]; accounts: Account[] }) {
  const [adjDate, setAdjDate] = useState(new Date().toISOString().slice(0, 10));
  const [customerId, setCustomerId] = useState("");
  const [direction, setDirection] = useState<AdjustmentDirection>("debit");
  const [contraAccountId, setContraAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const contra = accounts.find((a) => a.id === contraAccountId);
  const customerName = customers.find((c) => c.id === customerId)?.name ?? "";
  const amt = parseFloat(amount) || 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setLoading(true);
    const result = await createCustomerAdjustment(supabase, {
      adjDate, customerId, customerName, direction, contraAccountId,
      contraLabel: contra ? `${contra.account_code} ${contra.account_name}` : "",
      amount: amt, note, createdBy: await getCurrentUserId(supabase),
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "সেভ করা যায়নি।");
      return;
    }
    setSuccess(true);
    setCustomerId("");
    setContraAccountId("");
    setAmount("");
    setNote("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-3xl">
      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Date</label>
          <input type="date" value={adjDate} onChange={(e) => setAdjDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="block text-sm text-gray-600 mb-1">Customer</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" required>
            <option value="">-- বাছুন --</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">ধরন</label>
          <select value={direction} onChange={(e) => setDirection(e.target.value as AdjustmentDirection)} className="rounded-lg border px-3 py-2 text-sm">
            <option value="debit">বাকিতে যোগ (কাস্টমারের বাকি বাড়বে)</option>
            <option value="credit">বাকি কমানো (কাস্টমারের বাকি কমবে)</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[260px]">
          <label className="block text-sm text-gray-600 mb-1">বিপরীত Account (যেমন 2710 মুন্না-3)</label>
          <select value={contraAccountId} onChange={(e) => setContraAccountId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" required>
            <option value="">-- বাছুন --</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} - {a.account_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Amount</label>
          <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-40" required />
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-600 mb-1">Note (ঐচ্ছিক)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="যেমন: মুন্না-3 কমিশন — সেপ্টেম্বর" className="w-full rounded-lg border px-3 py-2 text-sm" />
      </div>

      {customerId && contra && amt > 0 && (
        <p className="text-xs text-gray-600 bg-gray-50 border rounded-lg px-3 py-2">
          JV:{" "}
          {direction === "debit"
            ? <>Dr 1100 Accounts Receivable ({customerName}) / Cr {contra.account_code} {contra.account_name}</>
            : <>Dr {contra.account_code} {contra.account_name} / Cr 1100 Accounts Receivable ({customerName})</>}
          {" "}— {amt.toLocaleString("en-IN")} টাকা। {customerName}-এর বাকি {direction === "debit" ? "বাড়বে" : "কমবে"}।
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-700">✅ এডজাস্টমেন্ট সেভ হয়েছে।</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "সেভ করুন"}
      </button>
    </form>
  );
}
