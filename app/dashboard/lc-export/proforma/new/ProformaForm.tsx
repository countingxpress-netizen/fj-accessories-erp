"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { calcPiWeightLbs } from "@/lib/calcTubeCutting";
import { formatStyle } from "@/lib/formatStyle";
import { generateNextDocNo } from "@/lib/docNumber";

type Booking = {
  id: string; booking_no: string; quantity_pcs: number; product_id: string; customer_id: string;
  style: string | null; buyers: { name: string } | null; merchants: { name: string } | null;
  measurement_type: string; measurement_unit: string; length_val: number; width_val: number;
  flap_val: number | null; gusset_val: number | null; pi_thickness_mm: number | null;
  finished_goods: { product_name: string; length_cm: number; width_cm: number; thickness: number } | null;
};
type Customer = { id: string; name: string; price_per_lbs: number | null };

const CM_PER_INCH = 2.54;

export default function ProformaForm({ customers, bookings }: { customers: Customer[]; bookings: Booking[] }) {
  const [customerId, setCustomerId] = useState("");
  const [piDate, setPiDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedBookings, setSelectedBookings] = useState<Record<string, boolean>>({});
  const [priceOverride, setPriceOverride] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const customerBookings = useMemo(() => bookings.filter((b) => b.customer_id === customerId), [bookings, customerId]);

  function calcUnitPrice(b: Booking) {
    if (!b.finished_goods || !b.pi_thickness_mm) return 0;
    const price = parseFloat(priceOverride[b.id] || "") || selectedCustomer?.price_per_lbs || 0;
    const { length_cm, width_cm } = b.finished_goods;
    return (price * length_cm * width_cm * b.pi_thickness_mm) / 75000 / CM_PER_INCH / CM_PER_INCH;
  }

  function calcAmount(b: Booking) {
    return calcUnitPrice(b) * b.quantity_pcs;
  }

  function calcWeight(b: Booking) {
    return calcPiWeightLbs(b, b.pi_thickness_mm ?? 0);
  }

  const checkedBookings = customerBookings.filter((b) => selectedBookings[b.id]);
  const totalAmount = checkedBookings.reduce((s, b) => s + calcAmount(b), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!customerId || checkedBookings.length === 0) {
      setError("Customer বাছুন এবং অন্তত একটা বুকিং টিক দিন।");
      return;
    }
    setLoading(true);

    const styles = Array.from(new Set(checkedBookings.map((b) => b.style).filter(Boolean))).join(", ");
    const firstBooking = checkedBookings[0];

    const piNo = await generateNextDocNo(supabase, "proforma_invoices", "pi_no", "PI", "pi_date", piDate);

    const { data: pi, error: piError } = await supabase
      .from("proforma_invoices")
      .insert({
        pi_no: piNo, customer_id: customerId, pi_date: piDate,
        style: styles || null, buyer_name: firstBooking.buyers?.name ?? null,
        merchant_name: firstBooking.merchants?.name ?? null, total_amount: totalAmount,
      })
      .select().single();

    if (piError || !pi) {
      setLoading(false);
      setError(piError?.message ?? "PI তৈরি ব্যর্থ হয়েছে।");
      return;
    }

    await supabase.from("pi_bookings").insert(
      checkedBookings.map((b) => ({ pi_id: pi.id, booking_id: b.id }))
    );

    setLoading(false);
    router.push("/dashboard/lc-export/proforma");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-4xl">
      <div className="flex gap-4">
        <div className="flex-1 max-w-xs">
          <label className="block text-sm text-gray-600 mb-1">Customer</label>
          <select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setSelectedBookings({}); }} className="w-full rounded-lg border px-3 py-2 text-sm" required>
            <option value="">-- বাছুন --</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">PI Date</label>
          <input type="date" value={piDate} onChange={(e) => setPiDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
        </div>
      </div>

      {customerId && (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2 w-10"></th>
                <th className="px-3 py-2">Booking</th>
                <th className="px-3 py-2">Style</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 w-32">Price/Lbs</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {customerBookings.map((b) => (
                <tr key={b.id} className="border-t">
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={!!selectedBookings[b.id]} onChange={(e) => setSelectedBookings((prev) => ({ ...prev, [b.id]: e.target.checked }))} />
                  </td>
                  <td className="px-3 py-2 font-medium">{b.booking_no}</td>
                  <td className="px-3 py-2 text-gray-500">{b.style || "-"}</td>
                  <td className="px-3 py-2">{b.finished_goods?.product_name}</td>
                  <td className="px-3 py-2 text-right">{b.quantity_pcs}</td>
                  <td className="px-3 py-2">
                    <input type="number" step="0.01" placeholder={String(selectedCustomer?.price_per_lbs ?? "")} value={priceOverride[b.id] || ""} onChange={(e) => setPriceOverride((prev) => ({ ...prev, [b.id]: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm" />
                  </td>
                  <td className="px-3 py-2 text-right">{calcWeight(b).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{calcAmount(b).toFixed(2)}</td>
                </tr>
              ))}
              {customerBookings.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-3 text-gray-400 italic">এই কাস্টমারের কোনো বুকিং নেই</td></tr>
              )}
            </tbody>
            <tfoot className="bg-gray-50 border-t font-semibold">
              <tr><td colSpan={6} className="px-3 py-2 text-right">Total</td><td className="px-3 py-2 text-right">{totalAmount.toFixed(2)}</td></tr>
            </tfoot>
          </table>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading || checkedBookings.length === 0} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "Proforma Invoice তৈরি করুন"}
      </button>
    </form>
  );
}