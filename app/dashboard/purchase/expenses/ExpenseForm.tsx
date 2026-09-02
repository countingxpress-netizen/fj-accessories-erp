"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";
import { getCurrentUserId } from "@/lib/currentUser";

type Account = { id: string; account_code: string; account_name: string };

export default function ExpenseForm({
  expenseAccounts, cashBankAccounts,
}: { expenseAccounts: Account[]; cashBankAccounts: Account[] }) {
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState("");
  const [paidViaAccountId, setPaidViaAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [payee, setPayee] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const amt = parseFloat(amount);
    if (!accountId || !paidViaAccountId || !amt || amt <= 0) {
      setError("Expense Head, Paid Via এবং সঠিক Amount দিন।");
      return;
    }
    setLoading(true);

    const expenseAccountName = expenseAccounts.find((a) => a.id === accountId)?.account_name ?? "";

    const voucherNo = await generateNextDocNo(supabase, "journal_vouchers", "voucher_no", "JV", "voucher_date", expenseDate);
    const createdBy = await getCurrentUserId(supabase);
    const { data: voucher, error: voucherError } = await supabase
      .from("journal_vouchers")
      .insert({
        voucher_no: voucherNo, voucher_date: expenseDate,
        narration: `Expense — ${expenseAccountName}${payee ? " (" + payee + ")" : ""}${description ? " — " + description : ""}`,
        created_by: createdBy,
      })
      .select().single();

    if (voucherError || !voucher) {
      setLoading(false);
      setError(voucherError?.message ?? "Voucher তৈরি ব্যর্থ হয়েছে।");
      return;
    }

    const { error: linesError } = await supabase.from("journal_entry_lines").insert([
      { voucher_id: voucher.id, account_id: accountId, debit: amt, credit: 0, memo: description || payee || expenseAccountName },
      { voucher_id: voucher.id, account_id: paidViaAccountId, debit: 0, credit: amt, memo: description || payee || expenseAccountName },
    ]);

    if (linesError) {
      setLoading(false);
      setError(linesError.message);
      return;
    }

    await supabase.from("expenses").insert({
      expense_date: expenseDate, account_id: accountId, paid_via_account_id: paidViaAccountId,
      amount: amt, payee, description, voucher_id: voucher.id, created_by: createdBy,
    });

    setLoading(false);
    setAmount(""); setPayee(""); setDescription("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-2xl">
      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Date</label>
          <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm text-gray-600 mb-1">Expense Head</label>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" required>
            <option value="">-- বাছুন --</option>
            {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} - {a.account_name}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm text-gray-600 mb-1">Paid Via (Cash/Bank)</label>
          <select value={paidViaAccountId} onChange={(e) => setPaidViaAccountId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" required>
            <option value="">-- বাছুন --</option>
            {cashBankAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} - {a.account_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Amount</label>
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-40" required />
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm text-gray-600 mb-1">Payee (কাকে দেওয়া হলো, ঐচ্ছিক)</label>
          <input value={payee} onChange={(e) => setPayee(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm text-gray-600 mb-1">Description (ঐচ্ছিক)</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "Expense সেভ করুন (+ অটো Journal Voucher)"}
      </button>
    </form>
  );
}