"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";

type Customer = { id: string; name: string };
type Account = { id: string; account_code: string; account_name: string };

export default function PaymentForm({ customers, cashBankAccounts }: { customers: Customer[]; cashBankAccounts: Account[] }) {
  const [customerId, setCustomerId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const amt = parseFloat(amount);
    if (!customerId || !accountId || !amt || amt <= 0) {
      setError("সব ফিল্ড ঠিকমতো পূরণ করুন।");
      return;
    }
    setLoading(true);

    const { data: arAccount } = await supabase.from("chart_of_accounts").select("id").eq("account_code", "1100").single();
    if (!arAccount) {
      setLoading(false);
      setError("Accounts Receivable (কোড 1100) অ্যাকাউন্ট পাওয়া যায়নি।");
      return;
    }

    const customerName = customers.find((c) => c.id === customerId)?.name ?? "";
    const voucherNo = await generateNextDocNo(supabase, "journal_vouchers", "voucher_no", "JV", "voucher_date", paymentDate);

    const { data: voucher, error: voucherError } = await supabase
      .from("journal_vouchers")
      .insert({
        voucher_no: voucherNo, voucher_date: paymentDate,
        narration: `Payment received from ${customerName}${note ? " — " + note : ""}`,
      })
      .select().single();

    if (voucherError || !voucher) {
      setLoading(false);
      setError(voucherError?.message ?? "Voucher তৈরি ব্যর্থ হয়েছে।");
      return;
    }

    const { error: linesError } = await supabase.from("journal_entry_lines").insert([
      { voucher_id: voucher.id, account_id: accountId, debit: amt, credit: 0, memo: `Received from ${customerName}` },
      { voucher_id: voucher.id, account_id: arAccount.id, debit: 0, credit: amt, memo: `Received from ${customerName}` },
    ]);

    // customer_payments টেবিলে রেফারেন্স রাখুন (statement-এ সহজে দেখানোর জন্য)
    await supabase.from("customer_payments").insert({
      customer_id: customerId, voucher_id: voucher.id, amount: amt, payment_date: paymentDate, note,
    });

    setLoading(false);

    if (linesError) {
      setError(linesError.message);
      return;
    }

    router.push("/dashboard/sales/customer-ledger");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-xl">
      <div>
        <label className="block text-sm text-gray-600 mb-1">Customer</label>
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" required>
          <option value="">-- বাছুন --</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm text-gray-600 mb-1">টাকা কোথায় জমা হয়েছে (Cash / Bank)</label>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" required>
          <option value="">-- বাছুন --</option>
          {cashBankAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} - {a.account_name}</option>)}
        </select>
      </div>
      <div className="flex gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Amount</label>
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-40" required />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Payment Date</label>
          <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
        </div>
      </div>
      <div>
        <label className="block text-sm text-gray-600 mb-1">Note (ঐচ্ছিক)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "Payment সেভ করুন"}
      </button>
    </form>
  );
}