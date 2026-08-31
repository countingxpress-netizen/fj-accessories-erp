"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";
import { postBookingConsumptionJv } from "@/lib/inventoryCost";



type Booking = {
  id: string;
  booking_no: string;
  quantity_pcs: number;
  required_lbs: number;
  customers: { name: string } | null;
  finished_goods: { product_name: string } | null;
};
type Material = { id: string; material_name: string };
type Warehouse = { id: string; name: string };

export default function ProductionOrderForm({
  bookings,
  materials,
  warehouses,
}: {
  bookings: Booking[];
  materials: Material[];
  warehouses: Warehouse[];
}) {
  const [bookingId, setBookingId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [requiredLbs, setRequiredLbs] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const selectedBooking = bookings.find((b) => b.id === bookingId);

  function handleBookingChange(id: string) {
    setBookingId(id);
    const b = bookings.find((x) => x.id === id);
    if (b) setRequiredLbs(String(b.required_lbs));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const qty = parseFloat(requiredLbs);
    if (!bookingId || !materialId || !warehouseId || !qty || qty <= 0) {
      setError("সব ফিল্ড ঠিকমতো পূরণ করুন।");
      return;
    }

    setLoading(true);

    // স্টক চেক করুন
    const { data: stock } = await supabase
      .from("raw_material_stock")
      .select("*")
      .eq("material_id", materialId)
      .eq("warehouse_id", warehouseId)
      .maybeSingle();

    const currentQty = stock?.quantity_lbs ?? 0;
    if (currentQty < qty) {
      setLoading(false);
      setError(`পর্যাপ্ত স্টক নেই। বর্তমান স্টক: ${currentQty.toFixed(2)} Lbs, প্রয়োজন: ${qty.toFixed(2)} Lbs`);
      return;
    }

    // ১. production_orders তৈরি
    const productionNo = await generateNextDocNo(supabase, "production_orders", "production_no", "PROD", "order_date", orderDate);

    const { data: order, error: orderError } = await supabase
      .from("production_orders")
      .insert({
        production_no: productionNo,
        booking_id: bookingId,
        product_id: selectedBooking ? undefined : null,
        quantity_pcs: selectedBooking?.quantity_pcs,
        stage: "blowing",
        required_lbs: qty,
        order_date: orderDate,
      })
      .select()
      .single();

    if (orderError || !order) {
      setLoading(false);
      setError(orderError?.message ?? "Production Order তৈরি ব্যর্থ হয়েছে।");
      return;
    }

    // ২. Stock কমান
    if (stock) {
      await supabase
        .from("raw_material_stock")
        .update({ quantity_lbs: currentQty - qty, updated_at: new Date().toISOString() })
        .eq("id", stock.id);
    }

    // ৩. Stock Ledger এন্ট্রি
    await supabase.from("stock_ledger").insert({
      item_type: "raw_material",
      item_id: materialId,
      warehouse_id: warehouseId,
      txn_type: "out",
      quantity: qty,
      reference_type: "production",
      reference_id: order.id,
      txn_date: orderDate,
    });

    // ৪. material_consumption রেকর্ড
    await supabase.from("material_consumption").insert({
      production_id: order.id,
      material_id: materialId,
      quantity_lbs: qty,
      consumption_date: orderDate,
    });

    // ৫. Booking-এর status আপডেট করুন
    await supabase.from("bookings").update({ status: "in_production" }).eq("id", bookingId);

    // ৬. Perpetual — issued কাঁচামালের মূল্য WIP-এ (Dr 1300 / Cr material inv)
    const invVoucherId = await postBookingConsumptionJv(supabase, {
      date: orderDate,
      bookingNo: selectedBooking?.booking_no ?? productionNo,
      productionOrderId: order.id,
      lines: [{ materialId, qtyLbs: qty }],
    });
    if (invVoucherId) {
      await supabase.from("bookings").update({ inventory_voucher_id: invVoucherId }).eq("id", bookingId);
    }

    setLoading(false);
    router.push("/dashboard/production/orders");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-2xl">
      <div>
        <label className="block text-sm text-gray-600 mb-1">Booking (Open স্ট্যাটাসের বুকিং)</label>
        <select
          value={bookingId}
          onChange={(e) => handleBookingChange(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          required
        >
          <option value="">-- বাছুন --</option>
          {bookings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.booking_no} — {b.customers?.name} — {b.finished_goods?.product_name} ({b.quantity_pcs} pcs)
            </option>
          ))}
        </select>
      </div>

      {selectedBooking && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-900">
          বুকিং অনুযায়ী প্রয়োজনীয় কাঁচামাল: <strong>{selectedBooking.required_lbs} Lbs</strong>
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-sm text-gray-600 mb-1">Material</label>
          <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" required>
            <option value="">-- বাছুন --</option>
            {materials.map((m) => <option key={m.id} value={m.id}>{m.material_name}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-sm text-gray-600 mb-1">Warehouse (কোথা থেকে খরচ হবে)</label>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" required>
            <option value="">-- বাছুন --</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Required Lbs (প্রয়োজনে পরিবর্তন করুন)</label>
          <input
            type="number" step="0.01" value={requiredLbs}
            onChange={(e) => setRequiredLbs(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm w-40"
            required
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Order Date</label>
          <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "Production Order তৈরি করুন"}
      </button>
    </form>
  );
}