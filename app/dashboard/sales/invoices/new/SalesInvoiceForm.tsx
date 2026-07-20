"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";

type Booking = {
  id: string; booking_no: string; quantity_pcs: number; product_id: string; customer_id: string;
  style: string | null; buyers: { name: string } | null; merchants: { name: string } | null;
  delivery_point: string | null; customer_booking_ref: string | null;
  has_print: boolean; print_colors: number; measurement_type: string; width_val: number; measurement_unit: string;
  finished_goods: { product_name: string; length_cm: number; width_cm: number; thickness: number } | null;
};
type Customer = { id: string; name: string; price_per_lbs: number | null };

const CM_PER_INCH = 2.54;

export default function SalesInvoiceForm({
  customers, bookings, invoicedMap,
}: { customers: Customer[]; bookings: Booking[]; invoicedMap: Record<string, number> }) {
  const [customerId, setCustomerId] = useState("");
  const [buyerFilter, setBuyerFilter] = useState("");
  const [merchantFilter, setMerchantFilter] = useState("");
  const [styleFilter, setStyleFilter] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentReceived, setPaymentReceived] = useState(false);
  const [selectedQty, setSelectedQty] = useState<Record<string, string>>({});
  const [priceOverride, setPriceOverride] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const selectedCustomer = customers.find((c) => c.id === customerId);

  const customerBookings = useMemo(() => {
    return bookings
      .filter((b) => b.customer_id === customerId)
      .map((b) => {
        const invoiced = invoicedMap[b.id] ?? 0;
        const remaining = b.quantity_pcs - invoiced;
        return { ...b, invoiced, remaining };
      })
      .filter((b) => b.remaining > 0)
      .filter((b) => !buyerFilter || b.buyers?.name === buyerFilter)
      .filter((b) => !merchantFilter || b.merchants?.name === merchantFilter)
      .filter((b) => !styleFilter || b.style === styleFilter);
  }, [bookings, customerId, invoicedMap, buyerFilter, merchantFilter, styleFilter]);

  const availableBuyers = useMemo(
    () => Array.from(new Set(bookings.filter((b) => b.customer_id === customerId).map((b) => b.buyers?.name).filter(Boolean))) as string[],
    [bookings, customerId]
  );
  const availableMerchants = useMemo(
    () => Array.from(new Set(bookings.filter((b) => b.customer_id === customerId).map((b) => b.merchants?.name).filter(Boolean))) as string[],
    [bookings, customerId]
  );
  const availableStyles = useMemo(
    () => Array.from(new Set(bookings.filter((b) => b.customer_id === customerId).map((b) => b.style).filter(Boolean))) as string[],
    [bookings, customerId]
  );

  const DEFAULT_PRINT_RATE = 0.20;
  const DEFAULT_ADHESIVE_RATE = 0.01;

  function getSurcharge(b: Booking) {
    let printCharge = 0, adhesiveCharge = 0;
    if (b.has_print) printCharge = (b.print_colors || 0) * DEFAULT_PRINT_RATE;
    if (b.measurement_type === "adhesive") {
      const widthInch = b.measurement_unit === "cm" ? b.width_val / CM_PER_INCH : b.width_val;
      adhesiveCharge = widthInch * DEFAULT_ADHESIVE_RATE;
    }
    return { printCharge, adhesiveCharge };
  }

  function getUnitPrice(b: Booking) {
    const overridden = priceOverride[b.id];
    const price = overridden ? parseFloat(overridden) : (selectedCustomer?.price_per_lbs ?? 0);
    if (!b.finished_goods || !price) return 0;
    const { length_cm, width_cm, thickness } = b.finished_goods;
    const baseUnitPrice = (price * length_cm * width_cm * thickness) / 75000 / CM_PER_INCH / CM_PER_INCH;
    const { printCharge, adhesiveCharge } = getSurcharge(b);
    return baseUnitPrice + printCharge + adhesiveCharge;
  }

  const lineItems = customerBookings
    .map((b) => {
      const qty = parseFloat(selectedQty[b.id] || "0");
      const unitPrice = getUnitPrice(b);
      return { booking: b, qty, unitPrice, amount: qty * unitPrice };
    })
    .filter((li) => li.qty > 0);

  const totalAmount = lineItems.reduce((s, li) => s + li.amount, 0);

  function updateQty(bookingId: string, value: string) {
    setSelectedQty((prev) => ({ ...prev, [bookingId]: value }));
  }
  function updatePrice(bookingId: string, value: string) {
    setPriceOverride((prev) => ({ ...prev, [bookingId]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!customerId || lineItems.length === 0) {
      setError("Customer বাছুন এবং অন্তত একটা বুকিং-এ Quantity দিন।");
      return;
    }
    for (const li of lineItems) {
      if (li.qty > li.booking.remaining) {
        setError(`${li.booking.booking_no}-এ বাকি আছে মাত্র ${li.booking.remaining} পিস।`);
        return;
      }
      if (li.unitPrice <= 0) {
        setError(`${li.booking.booking_no}-এর Unit Price শূন্য — Price/Lbs সেট করুন।`);
        return;
      }
    }

    setLoading(true);

    const firstBooking = lineItems[0].booking;
    const styles = Array.from(new Set(lineItems.map((li) => li.booking.style).filter(Boolean))).join(", ");
    const bookingRefs = Array.from(new Set(lineItems.map((li) => li.booking.customer_booking_ref).filter(Boolean))).join(", ");

    const invoiceNo = await generateNextDocNo(supabase, "sales_invoices", "invoice_no", "INV", "invoice_date", invoiceDate);

    const { data: invoice, error: invoiceError } = await supabase
      .from("sales_invoices")
      .insert({
        invoice_no: invoiceNo, customer_id: customerId, invoice_date: invoiceDate,
        buyer_name: firstBooking.buyers?.name ?? null,
        merchant_name: firstBooking.merchants?.name ?? null,
        style: styles || null,
        delivery_point: firstBooking.delivery_point ?? null,
        customer_booking_ref: bookingRefs || null,
        payment_received: paymentReceived,
      })
      .select().single();

    if (invoiceError || !invoice) {
      setLoading(false);
      setError(invoiceError?.message ?? "Invoice তৈরি ব্যর্থ হয়েছে।");
      return;
    }

    const { error: itemsError } = await supabase.from("sales_invoice_items").insert(
      lineItems.map((li) => ({
        invoice_id: invoice.id, product_id: li.booking.product_id, booking_id: li.booking.id,
        quantity_pcs: li.qty, unit_price: li.unitPrice,
      }))
    );

    if (itemsError) {
      setLoading(false);
      setError(itemsError.message);
      return;
    }

    // পেমেন্ট রিসিভড হলে Dr Cash, না হলে Dr Accounts Receivable
    const debitAccountCode = paymentReceived ? "1000" : "1100";
    const { data: debitAccount } = await supabase.from("chart_of_accounts").select("id").eq("account_code", debitAccountCode).single();
    const { data: salesAccount } = await supabase.from("chart_of_accounts").select("id").eq("account_code", "4000").single();

    if (debitAccount && salesAccount) {
      const voucherNo = await generateNextDocNo(supabase, "journal_vouchers", "voucher_no", "JV", "voucher_date", invoiceDate);
      const { data: voucher } = await supabase
        .from("journal_vouchers")
        .insert({
          voucher_no: voucherNo, voucher_date: invoiceDate,
          narration: `Sales Invoice ${invoiceNo} — ${selectedCustomer?.name} (${paymentReceived ? "Cash" : "Credit"})`,
        })
        .select().single();

      if (voucher) {
        await supabase.from("journal_entry_lines").insert([
          { voucher_id: voucher.id, account_id: debitAccount.id, debit: totalAmount, credit: 0, memo: `Invoice ${invoiceNo}` },
          { voucher_id: voucher.id, account_id: salesAccount.id, debit: 0, credit: totalAmount, memo: `Invoice ${invoiceNo}` },
        ]);
        await supabase.from("sales_invoices").update({ voucher_id: voucher.id }).eq("id", invoice.id);
      }
    }

    setLoading(false);
    router.push("/dashboard/sales/invoices");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-5xl">
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 max-w-xs">
          <label className="block text-sm text-gray-600 mb-1">Customer</label>
          <select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setSelectedQty({}); setPriceOverride({}); setBuyerFilter(""); setMerchantFilter(""); setStyleFilter(""); }} className="w-full rounded-lg border px-3 py-2 text-sm" required>
            <option value="">-- বাছুন --</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {customerId && (
          <>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Buyer Filter</label>
              <select value={buyerFilter} onChange={(e) => setBuyerFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
                <option value="">সব</option>
                {availableBuyers.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Merchant Filter</label>
              <select value={merchantFilter} onChange={(e) => setMerchantFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
                <option value="">সব</option>
                {availableMerchants.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Style Filter</label>
              <select value={styleFilter} onChange={(e) => setStyleFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
                <option value="">সব</option>
                {availableStyles.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </>
        )}
        <div>
          <label className="block text-sm text-gray-600 mb-1">Invoice Date</label>
          <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm bg-gray-50 border rounded-lg px-3 py-2 w-fit">
        <input type="checkbox" checked={paymentReceived} onChange={(e) => setPaymentReceived(e.target.checked)} />
        Payment Received (টিক থাকলে Cash Sale, না থাকলে বাকিতে বিক্রি)
      </label>

      {customerId && (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2">Booking</th>
                <th className="px-3 py-2">Style</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2 text-right">Remaining</th>
                <th className="px-3 py-2 w-28">Qty</th>
                <th className="px-3 py-2 w-32">Price/Lbs</th>
                <th className="px-3 py-2">Print/Adhesive Feature</th>
                <th className="px-3 py-2 text-right">Unit Price</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {customerBookings.map((b) => {
                const unitPrice = getUnitPrice(b);
                const qty = parseFloat(selectedQty[b.id] || "0");
                return (
                  <tr key={b.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{b.booking_no}</td>
                    <td className="px-3 py-2 text-gray-500">{b.style || "-"}</td>
                    <td className="px-3 py-2">{b.finished_goods?.product_name}</td>
                    <td className="px-3 py-2 text-right">{b.remaining}</td>
                    <td className="px-3 py-2">
                      <input type="number" step="1" min="0" max={b.remaining} value={selectedQty[b.id] || ""} onChange={(e) => updateQty(b.id, e.target.value)} className="w-full rounded border px-2 py-1 text-sm" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" step="0.01" placeholder={String(selectedCustomer?.price_per_lbs ?? "")} value={priceOverride[b.id] || ""} onChange={(e) => updatePrice(b.id, e.target.value)} className="w-full rounded border px-2 py-1 text-sm" />
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {b.has_print && `Print (${b.print_colors} color)`}
                      {b.has_print && b.measurement_type === "adhesive" && " + "}
                      {b.measurement_type === "adhesive" && "Adhesive"}
                      {!b.has_print && b.measurement_type !== "adhesive" && "-"}
                    </td>
                    <td className="px-3 py-2 text-right">{unitPrice.toFixed(4)}</td>
                    <td className="px-3 py-2 text-right">{(qty * unitPrice).toFixed(2)}</td>
                  </tr>
                );
              })}
              {customerBookings.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-3 text-gray-400 italic">এই ফিল্টারে কোনো বুকিং নেই</td></tr>
              )}
            </tbody>
            <tfoot className="bg-gray-50 border-t font-semibold">
              <tr><td colSpan={7} className="px-3 py-2 text-right">Total</td><td className="px-3 py-2 text-right">{totalAmount.toFixed(2)}</td></tr>
            </tfoot>
          </table>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading || lineItems.length === 0} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "Sales Invoice তৈরি করুন"}
      </button>
    </form>
  );
}