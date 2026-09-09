"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";
import { getCurrentUserId } from "@/lib/currentUser";
import { money } from "@/lib/format";

type Customer = { id: string; name: string };
type Line = { key: string; description: string; qty: string; rate: string };

const newLine = (): Line => ({
  key: Math.random().toString(36).slice(2),
  description: "",
  qty: "",
  rate: "",
});

// প্রতি লাইনে Amount = round(Qty × Rate) — DB-এর generated column ও standard invoice-এর সাথে মিল
const lineAmount = (l: Line) => Math.round((parseFloat(l.qty) || 0) * (parseFloat(l.rate) || 0));

export default function OtherSalesInvoiceForm({ customers }: { customers: Customer[] }) {
  const [customerId, setCustomerId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentReceived, setPaymentReceived] = useState(false);
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const total = lines.reduce((s, l) => s + lineAmount(l), 0);

  function updateLine(key: string, field: "description" | "qty" | "rate", value: string) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, newLine()]);
  }
  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const validLines = lines.filter(
      (l) => l.description.trim() && (parseFloat(l.qty) || 0) > 0 && (parseFloat(l.rate) || 0) > 0
    );
    if (!customerId) {
      setError("Customer বাছুন।");
      return;
    }
    if (validLines.length === 0) {
      setError("অন্তত একটা লাইনে বিবরণ, পরিমাণ ও রেট দিন।");
      return;
    }

    setLoading(true);

    const customerName = customers.find((c) => c.id === customerId)?.name ?? "";
    const invoiceNo = await generateNextDocNo(supabase, "sales_invoices", "invoice_no", "INV", "invoice_date", invoiceDate);
    const createdBy = await getCurrentUserId(supabase);

    const { data: invoice, error: invoiceError } = await supabase
      .from("sales_invoices")
      .insert({
        invoice_no: invoiceNo,
        customer_id: customerId,
        invoice_date: invoiceDate,
        invoice_type: "other",
        payment_received: paymentReceived,
        payment_type: paymentReceived ? "cash" : "credit",
        created_by: createdBy,
      })
      .select()
      .single();

    if (invoiceError || !invoice) {
      setLoading(false);
      setError(invoiceError?.message ?? "Invoice তৈরি ব্যর্থ হয়েছে।");
      return;
    }

    const { error: itemsError } = await supabase.from("sales_invoice_items").insert(
      validLines.map((l) => ({
        invoice_id: invoice.id,
        product_id: null,
        booking_id: null,
        quantity_pcs: parseFloat(l.qty),
        unit_price: parseFloat(l.rate),
        line_type: "other",
        line_label: l.description.trim(),
      }))
    );

    if (itemsError) {
      setLoading(false);
      setError(itemsError.message);
      return;
    }

    const debitAccountCode = paymentReceived ? "1000" : "1100";
    const { data: debitAccount } = await supabase.from("chart_of_accounts").select("id").eq("account_code", debitAccountCode).single();
    const { data: salesAccount } = await supabase.from("chart_of_accounts").select("id").eq("account_code", "4000").single();

    if (debitAccount && salesAccount) {
      const voucherNo = await generateNextDocNo(supabase, "journal_vouchers", "voucher_no", "JV", "voucher_date", invoiceDate);
      const { data: voucher } = await supabase
        .from("journal_vouchers")
        .insert({
          voucher_no: voucherNo,
          voucher_date: invoiceDate,
          narration: `Sales Invoice ${invoiceNo} — ${customerName} (Other, ${paymentReceived ? "Cash" : "Credit"})`,
          created_by: createdBy,
          source: "sales_invoice",
        })
        .select()
        .single();

      if (voucher) {
        await supabase.from("journal_entry_lines").insert([
          { voucher_id: voucher.id, account_id: debitAccount.id, debit: total, credit: 0, memo: `Invoice ${invoiceNo}` },
          { voucher_id: voucher.id, account_id: salesAccount.id, debit: 0, credit: total, memo: `Invoice ${invoiceNo}` },
        ]);
        await supabase.from("sales_invoices").update({ voucher_id: voucher.id }).eq("id", invoice.id);
      }
    }

    setLoading(false);
    router.push("/dashboard/sales/invoices");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 max-w-xs">
          <label className="block text-sm text-gray-600 mb-1">Customer</label>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            required
          >
            <option value="">-- বাছুন --</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Invoice Date</label>
          <input
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            required
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm bg-gray-50 border rounded-lg px-3 py-2 w-fit">
        <input type="checkbox" checked={paymentReceived} onChange={(e) => setPaymentReceived(e.target.checked)} />
        Payment Received (টিক থাকলে Cash Sale, না থাকলে বাকিতে বিক্রি)
      </label>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-3 py-2">বিবরণ (Description)</th>
              <th className="px-3 py-2 w-32 text-right">পরিমাণ (Qty)</th>
              <th className="px-3 py-2 w-32 text-right">রেট (Rate)</th>
              <th className="px-3 py-2 w-32 text-right">টাকা (Amount)</th>
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key} className="border-t">
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={l.description}
                    onChange={(e) => updateLine(l.key, "description", e.target.value)}
                    placeholder="যেমন: ঝুট বিক্রি / Cylinder charge / Transport"
                    className="w-full rounded border px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="0.01"
                    value={l.qty}
                    onChange={(e) => updateLine(l.key, "qty", e.target.value)}
                    className="w-full rounded border px-2 py-1 text-sm text-right"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="0.01"
                    value={l.rate}
                    onChange={(e) => updateLine(l.key, "rate", e.target.value)}
                    className="w-full rounded border px-2 py-1 text-sm text-right"
                  />
                </td>
                <td className="px-3 py-2 text-right">{money(lineAmount(l))}</td>
                <td className="px-3 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => removeLine(l.key)}
                    disabled={lines.length === 1}
                    className="text-red-600 hover:text-red-800 disabled:opacity-30"
                    aria-label="লাইন মুছুন"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t font-semibold">
            <tr>
              <td colSpan={3} className="px-3 py-2 text-right">Total</td>
              <td className="px-3 py-2 text-right">{money(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <button
        type="button"
        onClick={addLine}
        className="rounded-lg border border-dashed border-gray-400 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
      >
        + লাইন যোগ করুন
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div>
        <button
          type="submit"
          disabled={loading || total <= 0}
          className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40"
        >
          {loading ? "সেভ হচ্ছে..." : "Other Sales Invoice তৈরি করুন (+ অটো Journal Voucher)"}
        </button>
      </div>
    </form>
  );
}
