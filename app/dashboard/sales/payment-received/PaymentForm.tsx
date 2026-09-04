"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";
import { formatDate } from "@/lib/formatDate";
import { getCurrentUserId } from "@/lib/currentUser";
import { money } from "@/lib/format";

type Customer = { id: string; name: string };
type Account = { id: string; account_code: string; account_name: string };
type UnpaidInvoice = { id: string; invoice_no: string; invoice_date: string; total: number; due: number };

const initialState = {
  customerId: "", depositAccountId: "", paymentMode: "cash",
  paymentDate: new Date().toISOString().slice(0, 10), bankCharges: "0", note: "",
};

export default function PaymentForm({
  customers, cashBankAccounts, invoicesByCustomer,
}: { customers: Customer[]; cashBankAccounts: Account[]; invoicesByCustomer: Record<string, UnpaidInvoice[]> }) {
  const [customerId, setCustomerId] = useState(initialState.customerId);
  const [depositAccountId, setDepositAccountId] = useState(initialState.depositAccountId);
  const [paymentMode, setPaymentMode] = useState(initialState.paymentMode);
  const [paymentDate, setPaymentDate] = useState(initialState.paymentDate);
  const [bankCharges, setBankCharges] = useState(initialState.bankCharges);
  const [note, setNote] = useState(initialState.note);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const unpaidInvoices = useMemo(() => invoicesByCustomer[customerId] ?? [], [invoicesByCustomer, customerId]);
  const totalDue = unpaidInvoices.reduce((s, inv) => s + inv.due, 0);
  const amountReceived = Object.values(allocations).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const isFullReceived = totalDue > 0 && Math.abs(amountReceived - totalDue) < 0.01;

  function autoAllocate(totalAmt: number) {
    let remaining = totalAmt;
    const next: Record<string, string> = {};
    for (const inv of unpaidInvoices) {
      if (remaining <= 0) break;
      const alloc = Math.min(inv.due, remaining);
      if (alloc > 0) next[inv.id] = alloc.toFixed(2);
      remaining -= alloc;
    }
    setAllocations(next);
  }

  function selectCustomer(id: string) {
    setCustomerId(id);
    setAllocations({});
  }

  function handleAmountReceivedChange(value: string) {
    autoAllocate(parseFloat(value) || 0);
  }

  function toggleReceivedFull(checked: boolean) {
    if (checked) autoAllocate(totalDue);
    else setAllocations({});
  }

  function payInFull(invoiceId: string, due: number) {
    setAllocations((prev) => ({ ...prev, [invoiceId]: due.toFixed(2) }));
  }

  function updateAllocation(invoiceId: string, value: string) {
    setAllocations((prev) => ({ ...prev, [invoiceId]: value }));
  }

  function resetForm() {
    setCustomerId(initialState.customerId);
    setDepositAccountId(initialState.depositAccountId);
    setPaymentMode(initialState.paymentMode);
    setPaymentDate(initialState.paymentDate);
    setBankCharges(initialState.bankCharges);
    setNote(initialState.note);
    setAllocations({});
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    const validAllocations = Object.entries(allocations).filter(([, v]) => parseFloat(v) > 0);
    if (!customerId || !depositAccountId || validAllocations.length === 0) {
      setError("Customer, Deposit To এবং অন্তত একটা Invoice-এ Payment দিন।");
      return;
    }

    setLoading(true);

    const charges = parseFloat(bankCharges) || 0;
    const totalAmount = amountReceived;

    const { data: arAccount } = await supabase.from("chart_of_accounts").select("id").eq("account_code", "1100").single();
    if (!arAccount) {
      setLoading(false);
      setError("Accounts Receivable (কোড 1100) অ্যাকাউন্ট পাওয়া যায়নি।");
      return;
    }

    let bankChargesAccountId: string | null = null;
    if (charges > 0) {
      const { data: bcAccount } = await supabase.from("chart_of_accounts").select("id").eq("account_code", "5400").single();
      bankChargesAccountId = bcAccount?.id ?? null;
    }

    const customerName = customers.find((c) => c.id === customerId)?.name ?? "";
    const voucherNo = await generateNextDocNo(supabase, "journal_vouchers", "voucher_no", "JV", "voucher_date", paymentDate);
    const createdBy = await getCurrentUserId(supabase);

    const { data: voucher, error: voucherError } = await supabase
      .from("journal_vouchers")
      .insert({
        voucher_no: voucherNo, voucher_date: paymentDate,
        narration: `Payment received from ${customerName}${note ? " — " + note : ""}`,
        created_by: createdBy,
      })
      .select().single();

    if (voucherError || !voucher) {
      setLoading(false);
      setError(voucherError?.message ?? "Voucher তৈরি ব্যর্থ হয়েছে।");
      return;
    }

    const lines = [
      { voucher_id: voucher.id, account_id: depositAccountId, debit: totalAmount - charges, credit: 0, memo: `Received from ${customerName}` },
    ];
    if (charges > 0 && bankChargesAccountId) {
      lines.push({ voucher_id: voucher.id, account_id: bankChargesAccountId, debit: charges, credit: 0, memo: "Bank Charges" });
    }
    lines.push({ voucher_id: voucher.id, account_id: arAccount.id, debit: 0, credit: totalAmount, memo: `Received from ${customerName}` });

    const { error: linesError } = await supabase.from("journal_entry_lines").insert(lines);
    if (linesError) {
      setLoading(false);
      setError(linesError.message);
      return;
    }

    const { data: payment, error: paymentError } = await supabase
      .from("customer_payments")
      .insert({
        customer_id: customerId, voucher_id: voucher.id, amount: totalAmount, payment_date: paymentDate,
        note, payment_mode: paymentMode, deposit_account_id: depositAccountId, bank_charges: charges,
        created_by: createdBy,
      })
      .select().single();

    if (paymentError || !payment) {
      setLoading(false);
      setError(paymentError?.message ?? "Payment রেকর্ড সেভ ব্যর্থ হয়েছে।");
      return;
    }

    await supabase.from("payment_allocations").insert(
      validAllocations.map(([invoiceId, amount]) => ({
        payment_id: payment.id, invoice_id: invoiceId, amount: parseFloat(amount),
      }))
    );

    setLoading(false);
    setSuccess(true);
    resetForm();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-2xl">
      <div>
        <label className="block text-sm text-gray-600 mb-1">Customer</label>
        <select value={customerId} onChange={(e) => selectCustomer(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" required>
          <option value="">-- বাছুন --</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {customerId && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Amount Received</label>
              <input
                type="number" step="0.01" min="0"
                value={amountReceived > 0 ? amountReceived.toFixed(2) : ""}
                onChange={(e) => handleAmountReceivedChange(e.target.value)}
                className="rounded-lg border px-3 py-2 text-sm w-40"
                placeholder="0.00"
              />
            </div>
            <label className="flex items-center gap-2 text-sm bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              <input type="checkbox" checked={isFullReceived} onChange={(e) => toggleReceivedFull(e.target.checked)} />
              Received Full Amount (BDT {money(totalDue)})
            </label>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <div className="bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700">Unpaid Invoices</div>
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500 border-t">
                <tr>
                  <th className="px-3 py-2">Invoice No</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Due</th>
                  <th className="px-3 py-2 w-32">Payment</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {unpaidInvoices.map((inv) => (
                  <tr key={inv.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{inv.invoice_no}</td>
                    <td className="px-3 py-2 text-gray-500">{formatDate(inv.invoice_date)}</td>
                    <td className="px-3 py-2 text-right">{money(inv.total)}</td>
                    <td className="px-3 py-2 text-right">{money(inv.due)}</td>
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
                      <button type="button" onClick={() => payInFull(inv.id, inv.due)} className="text-xs text-blue-600 hover:underline">
                        Pay in Full
                      </button>
                    </td>
                  </tr>
                ))}
                {unpaidInvoices.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-3 text-gray-400 italic">এই কাস্টমারের কোনো বকেয়া Invoice নেই</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

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
          <label className="block text-sm text-gray-600 mb-1">Bank Charges (ঐচ্ছিক)</label>
          <input type="number" step="0.01" value={bankCharges} onChange={(e) => setBankCharges(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-32" />
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-600 mb-1">Note (ঐচ্ছিক)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-700">✅ Payment সফলভাবে সেভ হয়েছে।</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "Payment সেভ করুন"}
      </button>
    </form>
  );
}