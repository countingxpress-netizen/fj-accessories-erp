"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";
import { getCurrentUserId } from "@/lib/currentUser";
import { money } from "@/lib/format";

type LineItem = {
  id: string; booking_id: string; product_id: string;
  quantity_pcs: number; unit_price: number;
  booking_no: string; product_name: string; maxQty: number;
};

export default function EditInvoiceForm({
  invoiceId, customerId, customerName, initialDate, voucherId, lines,
}: {
  invoiceId: string; customerId: string; customerName: string;
  initialDate: string; voucherId: string | null; lines: LineItem[];
}) {
  const [invoiceDate, setInvoiceDate] = useState(initialDate);
  const [items, setItems] = useState(lines.map((l) => ({ ...l, qty: String(l.quantity_pcs), price: String(l.unit_price) })));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  function updateItem(id: string, field: "qty" | "price", value: string) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)));
  }

  const totalAmount = items.reduce((s, it) => s + (parseFloat(it.qty) || 0) * (parseFloat(it.price) || 0), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    for (const it of items) {
      const qty = parseFloat(it.qty) || 0;
      if (qty > it.maxQty) {
        setError(`${it.booking_no}-এ সর্বোচ্চ ${it.maxQty} পিস পর্যন্ত দেওয়া যাবে।`);
        return;
      }
    }

    setLoading(true);

    // পুরনো items মুছুন
    await supabase.from("sales_invoice_items").delete().eq("invoice_id", invoiceId);

    // নতুন items বসান
    const validItems = items.filter((it) => (parseFloat(it.qty) || 0) > 0);
    if (validItems.length === 0) {
      setLoading(false);
      setError("অন্তত একটা লাইনে Quantity থাকতে হবে।");
      return;
    }
    await supabase.from("sales_invoice_items").insert(
      validItems.map((it) => ({
        invoice_id: invoiceId, product_id: it.product_id, booking_id: it.booking_id,
        quantity_pcs: parseFloat(it.qty), unit_price: parseFloat(it.price),
      }))
    );

    // invoice তারিখ আপডেট
    await supabase.from("sales_invoices").update({ invoice_date: invoiceDate }).eq("id", invoiceId);

    // পুরনো Journal Voucher মুছে নতুন বানান — invoice row টিকে থাকছে, তাই আগে
    // voucher_id null করতে হবে নাহলে plain FK-এ voucher delete আটকে orphan থেকে যায়
    if (voucherId) {
      await supabase.from("sales_invoices").update({ voucher_id: null }).eq("id", invoiceId);
      await supabase.from("journal_entry_lines").delete().eq("voucher_id", voucherId);
      await supabase.from("journal_vouchers").delete().eq("id", voucherId);
    }

    const { data: arAccount } = await supabase.from("chart_of_accounts").select("id").eq("account_code", "1100").single();
    const { data: salesAccount } = await supabase.from("chart_of_accounts").select("id").eq("account_code", "4000").single();

    if (arAccount && salesAccount) {
      const { data: invoiceRow } = await supabase.from("sales_invoices").select("invoice_no").eq("id", invoiceId).single();
      const voucherNo = await generateNextDocNo(supabase, "journal_vouchers", "voucher_no", "JV", "voucher_date", invoiceDate);
      const createdBy = await getCurrentUserId(supabase);
      const { data: voucher } = await supabase
        .from("journal_vouchers")
        .insert({ voucher_no: voucherNo, voucher_date: invoiceDate, narration: `Sales Invoice ${invoiceRow?.invoice_no} — ${customerName} (edited)`, created_by: createdBy })
        .select().single();

      if (voucher) {
        await supabase.from("journal_entry_lines").insert([
          { voucher_id: voucher.id, account_id: arAccount.id, debit: totalAmount, credit: 0, memo: `Invoice ${invoiceRow?.invoice_no}` },
          { voucher_id: voucher.id, account_id: salesAccount.id, debit: 0, credit: totalAmount, memo: `Invoice ${invoiceRow?.invoice_no}` },
        ]);
        await supabase.from("sales_invoices").update({ voucher_id: voucher.id }).eq("id", invoiceId);
      }
    }

    setLoading(false);
    router.push("/dashboard/sales/invoices");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-3xl">
      <p className="text-sm text-gray-600">Customer: <strong>{customerName}</strong></p>
      <div>
        <label className="block text-sm text-gray-600 mb-1">Invoice Date</label>
        <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-3 py-2">Booking</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2 w-28">Qty (max {""})</th>
              <th className="px-3 py-2 w-32">Unit Price</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-t">
                <td className="px-3 py-2 font-medium">{it.booking_no}</td>
                <td className="px-3 py-2">{it.product_name}</td>
                <td className="px-3 py-2">
                  <input type="number" step="1" min="0" max={it.maxQty} value={it.qty} onChange={(e) => updateItem(it.id, "qty", e.target.value)} className="w-full rounded border px-2 py-1 text-sm" />
                  <span className="text-xs text-gray-400 ml-1">(max {it.maxQty})</span>
                </td>
                <td className="px-3 py-2">
                  <input type="number" step="0.01" value={it.price} onChange={(e) => updateItem(it.id, "price", e.target.value)} className="w-full rounded border px-2 py-1 text-sm" />
                </td>
                <td className="px-3 py-2 text-right">{money(((parseFloat(it.qty) || 0) * (parseFloat(it.price) || 0)))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t font-semibold">
            <tr><td colSpan={4} className="px-3 py-2 text-right">Total</td><td className="px-3 py-2 text-right">{money(totalAmount)}</td></tr>
          </tfoot>
        </table>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "পরিবর্তন সেভ করুন"}
      </button>
    </form>
  );
}