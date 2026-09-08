"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/currentUser";
import { postFreightJv, recomputeEntryMaterials } from "@/lib/purchaseFreight";

type EntryOption = { id: string; label: string; entryDate: string };
type PaidVia = { id: string; account_code: string; account_name: string };

export default function FreightForm({
  entries, paidViaAccounts,
}: { entries: EntryOption[]; paidViaAccounts: PaidVia[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [entryId, setEntryId] = useState("");
  const [chargeDate, setChargeDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [paidViaId, setPaidViaId] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  function pickEntry(id: string) {
    setEntryId(id);
    const e = entries.find((x) => x.id === id);
    if (e?.entryDate) setChargeDate(e.entryDate);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const amt = parseFloat(amount);
    if (!entryId || !paidViaId || !amt || amt <= 0) {
      setError("Purchase Entry, Paid Via এবং সঠিক Amount দিন।");
      return;
    }
    setLoading(true);

    const createdBy = await getCurrentUserId(supabase);
    const { data: charge, error: insErr } = await supabase
      .from("purchase_freight_charges")
      .insert({
        purchase_entry_id: entryId,
        charge_date: chargeDate,
        amount: amt,
        paid_via_account_id: paidViaId,
        description: description || null,
        source: "separate",
        created_by: createdBy,
      })
      .select()
      .single();

    if (insErr || !charge) {
      setLoading(false);
      setError(insErr?.message ?? "Freight charge সেভ ব্যর্থ হয়েছে।");
      return;
    }

    const entryNo = entries.find((x) => x.id === entryId)?.label.split(" · ")[0] ?? null;
    const voucherId = await postFreightJv(supabase, {
      chargeId: charge.id,
      purchaseEntryId: entryId,
      entryNo,
      date: chargeDate,
      amount: amt,
      paidViaAccountId: paidViaId,
      description: description || null,
    });
    await recomputeEntryMaterials(supabase, entryId);

    setLoading(false);
    if (!voucherId) {
      setError("Freight সেভ হয়েছে কিন্তু Journal Voucher তৈরি হয়নি — ওই Purchase Entry-তে material লাইন আছে কি না দেখুন।");
    }
    setAmount("");
    setDescription("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-2xl">
      <div>
        <label className="block text-sm text-gray-600 mb-1">Purchase Entry</label>
        <select value={entryId} onChange={(e) => pickEntry(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" required>
          <option value="">-- বাছুন --</option>
          {entries.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Charge Date</label>
          <input type="date" value={chargeDate} onChange={(e) => setChargeDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Amount</label>
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-40 rounded-lg border px-3 py-2 text-sm" required />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm text-gray-600 mb-1">Paid Via (Cash / Bank / Md Abu Jafor)</label>
          <select value={paidViaId} onChange={(e) => setPaidViaId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" required>
            <option value="">-- বাছুন --</option>
            {paidViaAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} - {a.account_name}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-600 mb-1">Description (ঐচ্ছিক)</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="যেমন: LD Freight + Labour" />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "Freight সেভ করুন (+ অটো JV, কাঁচামালের দামে যোগ)"}
      </button>
    </form>
  );
}
