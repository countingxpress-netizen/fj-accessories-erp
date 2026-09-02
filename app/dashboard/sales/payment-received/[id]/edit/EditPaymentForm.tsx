"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";
import { formatDate } from "@/lib/formatDate";
import { getCurrentUserId } from "@/lib/currentUser";

type Account = { id: string; account_code: string; account_name: string };
type Invoice = { id: string; invoice_no: string; invoice_date: string; total: number; due: number };

export default function EditPaymentForm({
  payment, cashBankAccounts, invoices, currentAllocationMap,
}: { payment: any; cashBankAccounts: Account[]; invoices: Invoice[]; currentAllocationMap: Record<string, number> }) {
  const [paymentDate, setPaymentDate] = useState(payment.payment_date);
  const [paymentMode, setPaymentMode] = useState(payment.payment_mode ?? "cash");
  const [depositAccountId, setDepositAccountId] = useState(payment.deposit_account_id ?? "");
  const [bankCharges, setBankCharges] = useState(String(payment.bank_charges ?? 0));
  const [note, setNote] = useState(payment.note ?? "");
  const [allocations, setAllocations] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    Object.entries(currentAllocationMap).forEach(([id, amt]) => { init[id] = String(amt); });
    return init;
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  function updateAllocation(invoiceId: string, value: string) {
    setAllocations((prev) => ({ ...prev, [invoiceId]: value }));
  }
  function payInFull(inv: Invoice) {
    setAllocations((prev) => ({ ...prev, [inv.id]: inv.due.toFixed(2) }));
  }

  const totalAmount = Object.values(allocations).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const validAllocations = Object.entries(allocations).filter(([, v]) => parseFloat(v) > 0);
    if (!depositAccountId || validAllocations.length === 0) {
      setError("Deposit To এবং অন্তত একটা Invoice-এ Payment থাকতে হবে।");
      return;
    }

    setLoading(true);
    const charges = parseFloat(bankCharges) || 0;

    await supabase.from("customer_payments").update({
      payment_date: paymentDate, payment_mode: paymentMode,
      deposit_account_id: depositAccountId, bank_charges: charges, note, amount: totalAmount,
    }).eq("id", payment.id);

    await supabase.from("payment_allocations").delete().eq("payment_id", payment.id);
    await supabase.from("payment_allocations").insert(
      validAllocations.map(([invoiceId, amount]) => ({
        payment_id: payment.id, invoice_id: invoiceId, amount: parseFloat(amount),
      }))
    );

    if (payment.voucher_id) {
      // payment row টিকে থাকছে — voucher delete-এর আগে voucher_id null করতে হবে
      // নাহলে plain FK-এ আটকে লাইনহীন orphan voucher থেকে যায়
      await supabase.from("customer_payments").update({ voucher_id: null }).eq("id", payment.id);
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
      const createdBy = await getCurrentUserId(supabase);
      const { data: voucher } = await supabase
        .from("journal_vouchers")
        .insert({ voucher_no: voucherNo, voucher_date: paymentDate, narration: `Payment received (edited) — ${note || ""}`, created_by: createdBy })
        .select().single();

      if (voucher) {
        const lines = [
          { voucher_id: voucher.id, account_id: depositAccountId, debit: totalAmount - charges, credit: 0, memo: "Payment (edited)" },
        ];
        if (charges > 0 && bankChargesAccountId) {
          lines.push({ voucher_id: voucher.id, account_id: bankChargesAccountId, debit: charges, credit: 0, memo: "Bank Charges" });
        }
        lines.push({ voucher_id: voucher.id, account_id: arAccount.id, debit: 0, credit: totalAmount, memo: "Payment (edited)" });

        await supabase.from("journal_entry_lines").insert(lines);
        await supabase.from("customer_payments").update({ voucher_id: voucher.id }).eq("id", payment.id);
      }
    }

    setLoading(false);
    router.push(`/dashboard/sales/payment-received/${payment.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-2xl">
      <p className="text-sm text-gray-600">Total Amount: <strong>{totalAmount.toFixed(2)}</strong></p>

      <div className="rounded-lg border overflow-hidden">
        <div className="bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700">Invoice Allocations</div>
        <table className="w-full text-sm">
          <thead className="text-left text-gray-500 border-t">
            <tr>
              <th className="px-3 py-2">Invoice No</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Available Due</th>
              <th className="px-3 py-2 w-32">Payment</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-t">
                <td className="px-3 py-2 font-medium">{inv.invoice_no}</td>
                <td className="px-3 py-2 text-gray-500">{formatDate(inv.invoice_date)}</td>
                <td className="px-3 py-2 text-right">{inv.total.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">{inv.due.toFixed(2)}</td>
                <td className="px-3 py-2">
                  <input
                    type="number" step="0.01" min="0" max={inv.due}
                    value={allocations[inv.id] || ""}
                    onChange={(e) => updateAllocation(inv.id, e.target.value)}
                    className="w-full rounded border px-2 py-1 text-sm"
                    placeholder="0"
                  />
                </td>
                <td className="px-3 py-2">
                  <button type="button" onClick={() => payInFull(inv)} className="text-xs text-blue-600 hover:underline">Pay in Full</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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