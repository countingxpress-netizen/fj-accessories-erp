"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";
import { formatDate } from "@/lib/formatDate";

type Customer = { id: string; name: string };
type Account = { id: string; account_code: string; account_name: string };
type UnpaidInvoice = { id: string; invoice_no: string; invoice_date: string; total: number; due: number };

export default function PaymentForm({
  customers, cashBankAccounts, invoicesByCustomer,
}: { customers: Customer[]; cashBankAccounts: Account[]; invoicesByCustomer: Record<string, UnpaidInvoice[]> }) {
  const [customerId, setCustomerId] = useState("");
  const [depositAccountId, setDepositAccountId] = useState("");
  const [paymentMode, setPaymentMode] = useState("cash");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [bankCharges, setBankCharges] = useState("0");
  const [note, setNote] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [receivedFull, setReceivedFull] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const unpaidInvoices = useMemo(() => invoicesByCustomer[customerId] ?? [], [invoicesByCustomer, customerId]);
  const totalDue = unpaidInvoices.reduce((s, inv) => s + inv.due, 0);

  function selectCustomer(id: string) {
    setCustomerId(id);
    setAllocations({});
    setReceivedFull(false);
  }

  function toggleReceivedFull(checked: boolean) {
    setReceivedFull(checked);
    if (checked) {
      const next: Record<string, string> = {};
      unpaidInvoices.forEach((inv) => { next[inv.id] = inv.due.toFixed(2); });
      setAllocations(next);
    } else {
      setAllocations({});
    }
  }

  function payInFull(invoiceId: string, due: number) {
    setAllocations((prev) => ({ ...prev, [invoiceId]: due.toFixed(2) }));
  }

  function updateAllocation(invoiceId: string, value: string) {
    setAllocations((prev) => ({ ...prev, [invoiceId]: value }));
    setReceivedFull(false);
  }

  const amountReceived = Object.values(allocations).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

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
    router.push("/dashboard/sales/payment-received");
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
          <label className="flex items-center gap-2 text-sm bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 w-fit">
            <input type="checkbox" checked={receivedFull} onChange={(e) => toggleReceivedFull(e.target.checked)} />
            Received Full Amount (BDT {totalDue.toFixed(2)})
          </label>

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

          <div className="rounded-lg bg-gray-50 border p-3 text-sm font-medium">
            Amount Received: BDT {amountReceived.toFixed(2)}
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

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "Payment সেভ করুন"}
      </button>
    </form>
  );
}