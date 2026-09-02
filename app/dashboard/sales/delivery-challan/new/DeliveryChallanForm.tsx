"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";
import { recalcBookingStatus } from "@/lib/recalcBookingStatus";
import { formatStyle } from "@/lib/formatStyle";
import { postChallanCogsJv } from "@/lib/inventoryCost";
import { getCurrentUserId } from "@/lib/currentUser";

type Booking = {
  id: string; booking_no: string; quantity_pcs: number; product_id: string; customer_id: string;
  warehouse_id: string | null;
  style: string | null; garments_name: string | null; buyers: { name: string } | null; merchants: { name: string } | null;
  delivery_point: string | null; customer_booking_ref: string | null;
  finished_goods: { product_name: string } | null;
};
type Customer = { id: string; name: string };
type Warehouse = { id: string; name: string };

export default function DeliveryChallanForm({
  customers, bookings, warehouses, deliveredMap, stockByProduct,
}: {
  customers: Customer[]; bookings: Booking[]; warehouses: Warehouse[];
  deliveredMap: Record<string, number>;
  stockByProduct: Record<string, Record<string, number>>;
}) {
  const [customerId, setCustomerId] = useState("");
  const [buyerFilter, setBuyerFilter] = useState("");
  const [merchantFilter, setMerchantFilter] = useState("");
  const [styleFilter, setStyleFilter] = useState("");
  const [garmentsFilter, setGarmentsFilter] = useState("");
  const [challanDate, setChallanDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedQty, setSelectedQty] = useState<Record<string, string>>({});
  const [lineWarehouse, setLineWarehouse] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // একটি product-এর প্রতিটা warehouse-এ কত pcs আছে (সব warehouse দেখায়, না থাকলে 0)
  function warehouseRowsFor(productId: string) {
    const stock = stockByProduct[productId] ?? {};
    return warehouses
      .map((w) => ({ id: w.id, name: w.name, qty: stock[w.id] ?? 0 }))
      .sort((a, b) => b.qty - a.qty);
  }

  // ডিফল্ট warehouse: যেখানে এই product-এর স্টক সবচেয়ে বেশি → নাহলে booking-এর
  // warehouse → নাহলে তালিকার প্রথমটা
  function defaultWarehouseFor(b: Booking) {
    const rows = warehouseRowsFor(b.product_id);
    const withStock = rows.filter((r) => r.qty > 0);
    if (withStock.length) return withStock[0].id;
    if (b.warehouse_id) return b.warehouse_id;
    return warehouses[0]?.id ?? "";
  }

  function resolveWarehouse(b: Booking) {
    return lineWarehouse[b.id] || defaultWarehouseFor(b);
  }

  const customerBookings = useMemo(() => {
    return bookings
      .filter((b) => b.customer_id === customerId)
      .map((b) => {
        const delivered = deliveredMap[b.id] ?? 0;
        const remaining = b.quantity_pcs - delivered;
        return { ...b, delivered, remaining };
      })
      .filter((b) => b.remaining > 0)
      .filter((b) => !buyerFilter || b.buyers?.name === buyerFilter)
      .filter((b) => !merchantFilter || b.merchants?.name === merchantFilter)
      .filter((b) => !styleFilter || b.style === styleFilter)
      .filter((b) => !garmentsFilter || b.garments_name === garmentsFilter);
  }, [bookings, customerId, deliveredMap, buyerFilter, merchantFilter, styleFilter, garmentsFilter]);

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

  function updateQty(id: string, value: string) {
    setSelectedQty((prev) => ({ ...prev, [id]: value }));
  }

  const lineItems = customerBookings
    .map((b) => ({ booking: b, qty: parseFloat(selectedQty[b.id] || "0") }))
    .filter((li) => li.qty > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!customerId || lineItems.length === 0) {
      setError("Customer এবং অন্তত একটা বুকিং-এ Quantity দিন।");
      return;
    }
    for (const li of lineItems) {
      if (li.qty > li.booking.remaining) {
        setError(`${li.booking.booking_no}-এ বাকি আছে মাত্র ${li.booking.remaining} পিস।`);
        return;
      }
      if (!resolveWarehouse(li.booking)) {
        setError(`${li.booking.booking_no}-এর জন্য Warehouse বাছুন।`);
        return;
      }
    }

    setLoading(true);

    const challanNo = await generateNextDocNo(supabase, "delivery_challans", "challan_no", "DC", "challan_date", challanDate);
    const isPartial = lineItems.some((li) => li.qty < li.booking.remaining);
    const firstBooking = lineItems[0].booking;
    const bookingRefs = Array.from(new Set(lineItems.map((li) => li.booking.customer_booking_ref).filter(Boolean))).join(", ");

    const createdBy = await getCurrentUserId(supabase);
    const { data: challan, error: challanError } = await supabase
      .from("delivery_challans")
      .insert({
        challan_no: challanNo, booking_id: firstBooking.id, customer_id: customerId,
        challan_date: challanDate, is_partial: isPartial,
        buyer_name: firstBooking.buyers?.name ?? null, style: firstBooking.style ?? null,
        customer_booking_ref: bookingRefs || null,
        delivery_point: firstBooking.delivery_point ?? null,
        created_by: createdBy,
      })
      .select().single();

    if (challanError || !challan) {
      setLoading(false);
      setError(challanError?.message ?? "Challan তৈরি ব্যর্থ হয়েছে।");
      return;
    }

    for (const li of lineItems) {
      const wId = resolveWarehouse(li.booking);

      await supabase.from("delivery_challan_items").insert({
        challan_id: challan.id, product_id: li.booking.product_id, quantity_pcs: li.qty,
      });

      const { data: stock } = await supabase
        .from("finished_goods_stock").select("*")
        .eq("product_id", li.booking.product_id).eq("warehouse_id", wId).maybeSingle();

      if (stock) {
        await supabase.from("finished_goods_stock")
          .update({ quantity_pcs: stock.quantity_pcs - li.qty, updated_at: new Date().toISOString() })
          .eq("id", stock.id);
      } else {
        await supabase.from("finished_goods_stock")
          .insert({ product_id: li.booking.product_id, warehouse_id: wId, quantity_pcs: -li.qty });
      }

      await supabase.from("stock_ledger").insert({
        item_type: "finished_goods", item_id: li.booking.product_id, warehouse_id: wId,
        txn_type: "out", quantity: li.qty, reference_type: "delivery", reference_id: challan.id, txn_date: challanDate,
      });

      await recalcBookingStatus(supabase, li.booking.id);
    }

    // Perpetual — shipment-এর COGS (Dr 5000 COGS / Cr 1400 FG Inventory)
    const cogsVoucherId = await postChallanCogsJv(supabase, {
      date: challanDate,
      challanNo,
      lines: lineItems.map((li) => ({ productId: li.booking.product_id, pcs: li.qty })),
    });
    if (cogsVoucherId) {
      await supabase.from("delivery_challans").update({ inventory_voucher_id: cogsVoucherId }).eq("id", challan.id);
    }

    setLoading(false);
    router.push("/dashboard/sales/delivery-challan");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-4xl">
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 max-w-xs">
          <label className="block text-sm text-gray-600 mb-1">Customer</label>
          <select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setSelectedQty({}); setLineWarehouse({}); setBuyerFilter(""); setMerchantFilter(""); setStyleFilter(""); setGarmentsFilter(""); }} className="w-full rounded-lg border px-3 py-2 text-sm" required>
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
          <label className="block text-sm text-gray-600 mb-1">Challan Date</label>
          <input type="date" value={challanDate} onChange={(e) => setChallanDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
        </div>
      </div>

      {customerId && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2">Booking</th>
                <th className="px-3 py-2">Style</th>
                <th className="px-3 py-2">Buyer</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2 text-right">Remaining</th>
                <th className="px-3 py-2 w-28">Qty</th>
                <th className="px-3 py-2 w-56">Warehouse (স্টক থেকে কাটবে)</th>
              </tr>
            </thead>
            <tbody>
              {customerBookings.map((b) => {
                const wId = resolveWarehouse(b);
                const rows = warehouseRowsFor(b.product_id);
                const selectedRow = rows.find((r) => r.id === wId);
                const qty = parseFloat(selectedQty[b.id] || "0");
                const short = qty > 0 && selectedRow && qty > selectedRow.qty;
                return (
                  <tr key={b.id} className="border-t align-top">
                    <td className="px-3 py-2 font-medium">{b.booking_no}</td>
                    <td className="px-3 py-2 text-gray-500">{formatStyle(b.style)}</td>
                    <td className="px-3 py-2 text-gray-500">{b.buyers?.name || "-"}</td>
                    <td className="px-3 py-2">{b.finished_goods?.product_name}</td>
                    <td className="px-3 py-2 text-right">{b.remaining}</td>
                    <td className="px-3 py-2">
                      <input type="number" step="1" min="0" max={b.remaining} value={selectedQty[b.id] || ""} onChange={(e) => updateQty(b.id, e.target.value)} className="w-full rounded border px-2 py-1 text-sm" />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={wId}
                        onChange={(e) => setLineWarehouse((prev) => ({ ...prev, [b.id]: e.target.value }))}
                        className={`w-full rounded border px-2 py-1 text-sm ${short ? "border-red-400 bg-red-50" : ""}`}
                      >
                        {warehouses.length === 0 && <option value="">-- কোনো Warehouse নেই --</option>}
                        {rows.map((r) => (
                          <option key={r.id} value={r.id}>{r.name} — {r.qty} pcs</option>
                        ))}
                      </select>
                      {short && (
                        <p className="text-xs text-red-600 mt-0.5">
                          ⚠ এই গুদামে মাত্র {selectedRow?.qty ?? 0} pcs আছে — স্টক ঋণাত্মক হবে
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
              {customerBookings.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-3 text-gray-400 italic">এই ফিল্টারে কোনো বুকিং নেই</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading || lineItems.length === 0} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "Delivery Challan তৈরি করুন"}
      </button>
    </form>
  );
}
