"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { money } from "@/lib/format";

export default function EditBookingForm({ booking }: { booking: any }) {
  const [style, setStyle] = useState(booking.style ?? "");
  const [customerBookingRef, setCustomerBookingRef] = useState(booking.customer_booking_ref ?? "");
  const [productDetails, setProductDetails] = useState(booking.product_details ?? "");
  const [deliveryPoint, setDeliveryPoint] = useState(booking.delivery_point ?? "");
  const [printLayoutNote, setPrintLayoutNote] = useState(booking.print_layout_note ?? "");
  const [hasPrint, setHasPrint] = useState(booking.has_print ?? false);
  const [printColors, setPrintColors] = useState(String(booking.print_colors ?? 0));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.from("bookings").update({
      style, customer_booking_ref: customerBookingRef, product_details: productDetails,
      delivery_point: deliveryPoint, print_layout_note: printLayoutNote,
      has_print: hasPrint, print_colors: parseInt(printColors) || 0,
    }).eq("id", booking.id);

    setLoading(false);
    if (error) { setError(error.message); return; }
    router.push(`/dashboard/sales/bookings/${booking.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-2xl">
      <div className="rounded-lg border bg-gray-50 p-4 space-y-1 text-sm">
        <p className="font-semibold text-gray-700 mb-2">সম্পূর্ণ বুকিং তথ্য (শুধু পড়ার জন্য)</p>
        <p><span className="text-gray-500">Quantity:</span> {booking.quantity_pcs} pcs</p>
        <p><span className="text-gray-500">Measurement:</span> {booking.measurement_type} — L:{booking.length_val} W:{booking.width_val} {booking.flap_val ? `Flap:${booking.flap_val}` : ""} {booking.gusset_val ? `Gusset:${booking.gusset_val}` : ""} {booking.pillow_val ? `Pillow:${booking.pillow_val}` : ""} ({booking.measurement_unit})</p>
        <p><span className="text-gray-500">Order Thickness:</span> {booking.thickness_mm} mm | <span className="text-gray-500">Production Thickness:</span> {booking.production_thickness_mm} mm</p>
        <p><span className="text-gray-500">Material Type:</span> {booking.material_type}</p>
        <p><span className="text-gray-500">Required:</span> {money(booking.required_lbs)} Lbs</p>
      </div>
      <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg p-2">
        নোট: উপরের তথ্যগুলো (Quantity, Measurement, Material, Thickness) সরাসরি এখান থেকে বদলানো যাবে না — এসব বদলাতে হলে বুকিং মুছে নতুন করে দিন। নিচের ফিল্ডগুলো বদলানো যাবে।
      </p>
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-sm text-gray-600 mb-1">Style</label>
          <input value={style} onChange={(e) => setStyle(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-sm text-gray-600 mb-1">Customer Booking Ref</label>
          <input value={customerBookingRef} onChange={(e) => setCustomerBookingRef(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-sm text-gray-600 mb-1">Product Details</label>
        <input value={productDetails} onChange={(e) => setProductDetails(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-sm text-gray-600 mb-1">Delivery Point</label>
        <textarea value={deliveryPoint} onChange={(e) => setDeliveryPoint(e.target.value)} rows={2} className="w-full rounded-lg border px-3 py-2 text-sm" />
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={hasPrint} onChange={(e) => setHasPrint(e.target.checked)} />
          Print আছে?
        </label>
        {hasPrint && (
          <input type="number" min="0" value={printColors} onChange={(e) => setPrintColors(e.target.value)} className="w-24 rounded-lg border px-3 py-2 text-sm" />
        )}
      </div>
      <div>
        <label className="block text-sm text-gray-600 mb-1">Print Layout Note</label>
        <input value={printLayoutNote} onChange={(e) => setPrintLayoutNote(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "পরিবর্তন সেভ করুন"}
      </button>
    </form>
  );
}