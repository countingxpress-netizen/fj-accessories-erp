"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";
import { calcTubeCutting, toInches, hasAdhesiveCharge } from "@/lib/calcTubeCutting";
import { getCurrentUserId } from "@/lib/currentUser";
import { resolveRate } from "@/lib/rateHistory";
import { money } from "@/lib/format";

type Booking = {
  id: string; booking_no: string; booking_date: string | null; quantity_pcs: number; product_id: string; customer_id: string;
  style: string | null; garments_name: string | null; buyers: { name: string } | null; merchants: { name: string } | null;
  delivery_point: string | null; customer_booking_ref: string | null;
  has_print: boolean; print_colors: number; rate_per_color: number; rate_per_inch: number;
  measurement_type: string; measurement_unit: string;
  length_val: number; width_val: number; flap_val: number | null; gusset_val: number | null; pillow_val: number | null; thickness_mm: number;
  material_type: string;
  finished_goods: { product_name: string; length_cm: number; width_cm: number; thickness: number } | null;
};
type Customer = { id: string; name: string; price_per_lbs: number | null };
type PriceHistoryRow = { customer_id: string; effective_from: string; rate: number };

function formatMeasurement(b: Booking) {
  const unit = b.measurement_unit;
  const L = b.length_val, W = b.width_val, F = b.flap_val, G = b.gusset_val, P = b.pillow_val;
  if (b.measurement_type === "simple") return `L-${L} x W-${W} ${unit}`;
  if (b.measurement_type === "gusset") return `L-${L} x W-${W} + G-${G} ${unit}`;
  if (b.measurement_type === "adhesive") return `L-${L} + F-${F} x W-${W} ${unit}`;
  if (b.measurement_type === "flap_gusset") return `L-${L} + F-${F} + G-${G} x W-${W} ${unit}`;
  if (b.measurement_type === "pillow") return `L-${L} + P-${P} x W-${W} ${unit}`;
  return "-";
}

function getLineAmount(qty: number, unitPriceRounded: number) {
  return Math.floor(qty * unitPriceRounded);
}

export default function SalesInvoiceForm({
  customers, bookings, invoicedMap, priceHistory = [],
}: { customers: Customer[]; bookings: Booking[]; invoicedMap: Record<string, number>; priceHistory?: PriceHistoryRow[] }) {
  const [customerId, setCustomerId] = useState("");
  const [buyerFilter, setBuyerFilter] = useState("");
  const [merchantFilter, setMerchantFilter] = useState("");
  const [styleFilter, setStyleFilter] = useState("");
  const [garmentsFilter, setGarmentsFilter] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentReceived, setPaymentReceived] = useState(false);
  const [selectedBookings, setSelectedBookings] = useState<Record<string, boolean>>({});
  const [priceOverride, setPriceOverride] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const selectedCustomer = customers.find((c) => c.id === customerId);

  const historyForCustomer = useMemo(
    () => priceHistory.filter((h) => h.customer_id === customerId),
    [priceHistory, customerId]
  );

  // Booking-এর Booking Date ধরে সেই দিনে কার্যকর Price/Lbs (history না থাকলে
  // customer-এর বর্তমান price_per_lbs fallback)।
  function bookingPricePerLbs(b: Booking) {
    return resolveRate(historyForCustomer, b.booking_date, selectedCustomer?.price_per_lbs ?? 0);
  }

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
      .filter((b) => !styleFilter || b.style === styleFilter)
      .filter((b) => !garmentsFilter || b.garments_name === garmentsFilter);
  }, [bookings, customerId, invoicedMap, buyerFilter, merchantFilter, styleFilter, garmentsFilter]);

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
  const availableGarments = useMemo(
    () => Array.from(new Set(bookings.filter((b) => b.customer_id === customerId).map((b) => b.garments_name).filter(Boolean))) as string[],
    [bookings, customerId]
  );

  function getSurcharge(b: Booking, cuttingInch: number) {
    let printCharge = 0, adhesiveCharge = 0;
    if (b.has_print) printCharge = (b.print_colors || 0) * (b.rate_per_color || 0.20);
    // Adhesive/Flap Gusset-এ width_val-ই cutting, তাই একই cuttingInch (CM to Inch টেবিল-সহ) ব্যবহার হবে
    if (hasAdhesiveCharge(b.measurement_type)) adhesiveCharge = cuttingInch * (b.rate_per_inch || 0.02);
    return { printCharge, adhesiveCharge };
  }

  function getUnitPrice(b: Booking) {
    const overridden = priceOverride[b.id];
    const pricePerLbs = overridden ? parseFloat(overridden) : bookingPricePerLbs(b);
    if (!pricePerLbs || !b.thickness_mm) return 0;

    const { tube, cutting } = calcTubeCutting(b);
    const { tubeInch, cuttingInch } = toInches(tube, cutting, b.measurement_unit, b.material_type, b.has_print);

    const baseUnitPrice = (pricePerLbs * tubeInch * cuttingInch * b.thickness_mm) / 75000;
    const { printCharge, adhesiveCharge } = getSurcharge(b, cuttingInch);
    return baseUnitPrice + printCharge + adhesiveCharge;
  }

  const lineItems = customerBookings
    .filter((b) => selectedBookings[b.id])
    .map((b) => {
      const qty = b.remaining; // Sales Invoice সবসময় Full Quantity
      const unitPriceRaw = getUnitPrice(b);
      const unitPrice = Math.round(unitPriceRaw * 100) / 100;
      return { booking: b, qty, unitPrice, amount: getLineAmount(qty, unitPrice) };
    });

  const totalAmount = lineItems.reduce((s, li) => s + li.amount, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!customerId || lineItems.length === 0) {
      setError("Customer বাছুন এবং অন্তত একটা বুকিং সিলেক্ট করুন।");
      return;
    }
    if (lineItems.some((li) => li.unitPrice <= 0)) {
      setError("কোনো একটা বুকিং-এর Unit Price শূন্য — Price/Lbs সেট করা আছে কিনা দেখুন।");
      return;
    }

    setLoading(true);

    const firstBooking = lineItems[0].booking;
    const styles = Array.from(new Set(lineItems.map((li) => li.booking.style).filter(Boolean))).join(", ");
    const bookingRefs = Array.from(new Set(lineItems.map((li) => li.booking.customer_booking_ref).filter(Boolean))).join(", ");

    const invoiceNo = await generateNextDocNo(supabase, "sales_invoices", "invoice_no", "INV", "invoice_date", invoiceDate);
    const createdBy = await getCurrentUserId(supabase);

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
        created_by: createdBy,
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
          created_by: createdBy,
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
          <select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setSelectedBookings({}); setPriceOverride({}); setBuyerFilter(""); setMerchantFilter(""); setStyleFilter(""); setGarmentsFilter(""); }} className="w-full rounded-lg border px-3 py-2 text-sm" required>
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
            <div>
              <label className="block text-sm text-gray-600 mb-1">Garments Filter</label>
              <select value={garmentsFilter} onChange={(e) => setGarmentsFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
                <option value="">সব</option>
                {availableGarments.map((g) => <option key={g} value={g}>{g}</option>)}
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
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2 w-10"></th>
                <th className="px-3 py-2">Booking</th>
                <th className="px-3 py-2">Style</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Measurement</th>
                <th className="px-3 py-2 text-right">Order Thickness</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 w-32">Price/Lbs</th>
                <th className="px-3 py-2 text-right">Unit Price</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {customerBookings.map((b) => {
                const unitPriceRaw = getUnitPrice(b);
                const unitPrice = Math.round(unitPriceRaw * 100) / 100;
                const checked = !!selectedBookings[b.id];
                return (
                  <tr key={b.id} className="border-t">
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={checked} onChange={(e) => setSelectedBookings((prev) => ({ ...prev, [b.id]: e.target.checked }))} />
                    </td>
                    <td className="px-3 py-2 font-medium">{b.booking_no}</td>
                    <td className="px-3 py-2 text-gray-500">{b.style || "-"}</td>
                    <td className="px-3 py-2">{b.finished_goods?.product_name}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{formatMeasurement(b)}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{b.thickness_mm} mm</td>
                    <td className="px-3 py-2 text-right">{checked ? b.remaining : "-"}</td>
                    <td className="px-3 py-2">
                      <input type="number" step="0.01" placeholder={String(bookingPricePerLbs(b) || "")} value={priceOverride[b.id] || ""} onChange={(e) => setPriceOverride((prev) => ({ ...prev, [b.id]: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm" />
                      <span className="block text-[11px] text-gray-400">
                        Booking {b.booking_date ?? "?"} → {bookingPricePerLbs(b) || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">{money((Math.round(unitPrice * 100) / 100))}</td>
                    <td className="px-3 py-2 text-right">{checked ? money(getLineAmount(b.remaining, unitPrice)) : "-"}</td>
                  </tr>
                );
              })}
              {customerBookings.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-3 text-gray-400 italic">এই ফিল্টারে কোনো বুকিং নেই</td></tr>
              )}
            </tbody>
            <tfoot className="bg-gray-50 border-t font-semibold">
              <tr><td colSpan={9} className="px-3 py-2 text-right">Total</td><td className="px-3 py-2 text-right">{money(totalAmount)}</td></tr>
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