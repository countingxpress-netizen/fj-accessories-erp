"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";

type Account = { id: string; account_code: string; account_name: string };

export default function EditPaymentForm({ payment, cashBankAccounts }: { payment: any; cashBankAccounts: Account[] }) {
  const [paymentDate, setPaymentDate] = useState(payment.payment_date);
  const [paymentMode, setPaymentMode] = useState(payment.payment_mode ?? "cash");
  const [depositAccountId, setDepositAccountId] = useState(payment.deposit_account_id ?? "");
  const [bankCharges, setBankCharges] = useState(String(payment.bank_charges ?? 0));
  const [note, setNote] = useState(payment.note ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const charges = parseFloat(bankCharges) || 0;

    await supabase.from("customer_payments").update({
      payment_date: paymentDate, payment_mode: paymentMode,
      deposit_account_id: depositAccountId, bank_charges: charges, note,
    }).eq("id", payment.id);

    // পুরনো Journal Voucher মুছে নতুন করে বানান (নতুন account/charges অনুযায়ী)
    if (payment.voucher_id) {
      await supabase.from("journal_entry_lines").delete().eq("voucher_id", payment.voucher_id);
      await supabase.from("journal_vouchers").delete().eq("id", payment.voucher_id);
    }

    const { data: arAccount } = await supabase.from("chart_of_accounts").select("id").eq("account_code", "1100").single();
    let bankChargesAccountId: string | null = null;
    if (charges > 0) {
      const { data: bcAccount } = await supabase.from("chart_of_accounts").select("id").eq("account_code", "5400").single();
      bankChargesAccountId = bcAccount?.id ?? null;
    }

    if (arAccount) {
      const voucherNo = await generateNextDocNo(supabase, "journal_vouchers", "voucher_no", "JV", "voucher_date", paymentDate);
      const { data: voucher } = await supabase
        .from("journal_vouchers")
        .insert({ voucher_no: voucherNo, voucher_date: paymentDate, narration: `Payment received (edited) — ${note || ""}` })
        .select().single();

      if (voucher) {
        const lines = [
          { voucher_id: voucher.id, account_id: depositAccountId, debit: payment.amount - charges, credit: 0, memo: "Payment (edited)" },
        ];
        if (charges > 0 && bankChargesAccountId) {
          lines.push({ voucher_id: voucher.id, account_id: bankChargesAccountId, debit: charges, credit: 0, memo: "Bank Charges" });
        }
        lines.push({ voucher_id: voucher.id, account_id: arAccount.id, debit: 0, credit: payment.amount, memo: "Payment (edited)" });

        await supabase.from("journal_entry_lines").insert(lines);
        await supabase.from("customer_payments").update({ voucher_id: voucher.id }).eq("id", payment.id);
      }
    }

    setLoading(false);
    router.push(`/dashboard/sales/payment-received/${payment.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-xl">
      <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg p-2">
        নোট: Total Amount ও কোন Invoice-এ Apply হয়েছে তা এখান থেকে বদলানো যাবে না — শুধু Date, Mode, Deposit Account, Bank Charges, Note বদলানো যাবে।
      </p>
      <p className="text-sm text-gray-600">Total Amount: <strong>{payment.amount.toFixed(2)}</strong></p>
      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Payment Date</label>
          <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Payment Mode</label>
          <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="cheque">Cheque</option>
            <option value="mobile_banking">Mobile Banking</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Deposit To</label>
          <select value={depositAccountId} onChange={(e) => setDepositAccountId(e.target.value)} className="rounded-lg border px-3 py-2 text-sm min-w-[180px]" required>
            <option value="">-- বাছুন --</option>
            {cashBankAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} - {a.account_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Bank Charges</label>
          <input type="number" step="0.01" value={bankCharges} onChange={(e) => setBankCharges(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-32" />
        </div>
      </div>
      <div>
        <label className="block text-sm text-gray-600 mb-1">Note</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "পরিবর্তন সেভ করুন"}
      </button>
    </form>
  );
}