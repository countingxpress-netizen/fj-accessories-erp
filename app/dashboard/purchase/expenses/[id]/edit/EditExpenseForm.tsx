"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Account = { id: string; account_code: string; account_name: string };

export default function EditExpenseForm({
  expense, expenseAccounts, cashBankAccounts,
}: { expense: any; expenseAccounts: Account[]; cashBankAccounts: Account[] }) {
  const [expenseDate, setExpenseDate] = useState(expense.expense_date);
  const [accountId, setAccountId] = useState(expense.account_id ?? "");
  const [paidViaAccountId, setPaidViaAccountId] = useState(expense.paid_via_account_id ?? "");
  const [amount, setAmount] = useState(String(expense.amount ?? ""));
  const [payee, setPayee] = useState(expense.payee ?? "");
  const [description, setDescription] = useState(expense.description ?? "");
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

    const { error: expenseError } = await supabase
      .from("expenses")
      .update({
        expense_date: expenseDate, account_id: accountId, paid_via_account_id: paidViaAccountId,
        amount: amt, payee, description,
      })
      .eq("id", expense.id);

    if (expenseError) {
      setLoading(false);
      setError(expenseError.message);
      return;
    }

    // JV-ও sync রাখা — পুরনো ২টা লাইন মুছে নতুন করে বসানো (edit করার সময় account/amount
    // যেটাই বদলাক না কেন, ঝুঁকিহীনভাবে হ্যান্ডেল হবে)।
    if (expense.voucher_id) {
      await supabase
        .from("journal_vouchers")
        .update({
          voucher_date: expenseDate,
          narration: `Expense — ${expenseAccountName}${payee ? " (" + payee + ")" : ""}${description ? " — " + description : ""}`,
        })
        .eq("id", expense.voucher_id);

      await supabase.from("journal_entry_lines").delete().eq("voucher_id", expense.voucher_id);
      const { error: linesError } = await supabase.from("journal_entry_lines").insert([
        { voucher_id: expense.voucher_id, account_id: accountId, debit: amt, credit: 0, memo: description || payee || expenseAccountName },
        { voucher_id: expense.voucher_id, account_id: paidViaAccountId, debit: 0, credit: amt, memo: description || payee || expenseAccountName },
      ]);
      if (linesError) {
        setLoading(false);
        setError(linesError.message);
        return;
      }
    }

    setLoading(false);
    router.push("/dashboard/purchase/expenses");
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
        {loading ? "সেভ হচ্ছে..." : "Expense আপডেট করুন"}
      </button>
    </form>
  );
}
