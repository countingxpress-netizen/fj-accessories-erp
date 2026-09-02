"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";
import { getCurrentUserId } from "@/lib/currentUser";

type LC = { id: string; lc_no: string };

export default function BankChargesForm({ lcs }: { lcs: LC[] }) {
  const [lcId, setLcId] = useState("");
  const [chargeDate, setChargeDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!amount) { setError("Amount দিন।"); return; }
    setLoading(true);

    const createdBy = await getCurrentUserId(supabase);
    const { error: chargeError } = await supabase.from("bank_charges").insert({
      lc_id: lcId || null, charge_date: chargeDate, description, amount: parseFloat(amount),
      created_by: createdBy,
    });

    if (chargeError) {
      setLoading(false);
      setError(chargeError.message);
      return;
    }

    // অটো Journal Voucher: Dr Bank/LC Charges Expense, Cr Bank
    const { data: chargeAccount } = await supabase.from("chart_of_accounts").select("id").eq("account_code", "5400").single();
    const { data: bankAccount } = await supabase.from("chart_of_accounts").select("id").eq("account_code", "1010").single();

    if (chargeAccount && bankAccount) {
      const voucherNo = await generateNextDocNo(supabase, "journal_vouchers", "voucher_no", "JV", "voucher_date", chargeDate);
      const { data: voucher } = await supabase
        .from("journal_vouchers")
        .insert({ voucher_no: voucherNo, voucher_date: chargeDate, narration: `Bank Charge — ${description || "N/A"}`, created_by: createdBy })
        .select().single();

      if (voucher) {
        await supabase.from("journal_entry_lines").insert([
          { voucher_id: voucher.id, account_id: chargeAccount.id, debit: parseFloat(amount), credit: 0, memo: description },
          { voucher_id: voucher.id, account_id: bankAccount.id, debit: 0, credit: parseFloat(amount), memo: description },
        ]);
      }
    }

    setLoading(false);
    setDescription(""); setAmount("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-2xl">
      <div>
        <label className="block text-sm text-gray-600 mb-1">Linked LC (ঐচ্ছিক)</label>
        <select value={lcId} onChange={(e) => setLcId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
          <option value="">-- বাছুন --</option>
          {lcs.map((l) => <option key={l.id} value={l.id}>{l.lc_no}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Charge Date</label>
          <input type="date" value={chargeDate} onChange={(e) => setChargeDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm text-gray-600 mb-1">Description</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Amount</label>
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-32" required />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "Bank Charge সেভ করুন (+ অটো Journal Voucher)"}
      </button>
    </form>
  );
}