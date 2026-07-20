"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ProductionOrder = {
  id: string;
  production_no: string;
  quantity_pcs: number;
  bookings: { customers: { name: string } | null; product_id: string; finished_goods: { id: string; product_name: string } | null } | null;
};
type Warehouse = { id: string; name: string };

export default function ReceiveForm({
  orders,
  warehouses,
}: {
  orders: ProductionOrder[];
  warehouses: Warehouse[];
}) {
  const [orderId, setOrderId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const selectedOrder = orders.find((o) => o.id === orderId);

  function handleOrderChange(id: string) {
    setOrderId(id);
    const o = orders.find((x) => x.id === id);
    if (o) setQuantity(String(o.quantity_pcs));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const qty = parseFloat(quantity);
    if (!orderId || !warehouseId || !qty || qty <= 0 || !selectedOrder?.bookings?.finished_goods?.id) {
      setError("সব ফিল্ড ঠিকমতো পূরণ করুন।");
      return;
    }

    const productId = selectedOrder.bookings.finished_goods.id;
    setLoading(true);

    // ১. production_orders-এর stage "finished" করুন
    const { error: updateOrderError } = await supabase
      .from("production_orders")
      .update({ stage: "finished" })
      .eq("id", orderId);

    if (updateOrderError) {
      setLoading(false);
      setError(updateOrderError.message);
      return;
    }

    // ২. finished_goods_receive রেকর্ড
    const { error: receiveError } = await supabase.from("finished_goods_receive").insert({
      production_id: orderId,
      product_id: productId,
      quantity_pcs: qty,
      received_date: receivedDate,
    });

    if (receiveError) {
      setLoading(false);
      setError(receiveError.message);
      return;
    }

    // ৩. finished_goods_stock আপডেট
    const { data: existingStock } = await supabase
      .from("finished_goods_stock")
      .select("*")
      .eq("product_id", productId)
      .eq("warehouse_id", warehouseId)
      .maybeSingle();

    if (existingStock) {
      await supabase
        .from("finished_goods_stock")
        .update({ quantity_pcs: existingStock.quantity_pcs + qty, updated_at: new Date().toISOString() })
        .eq("id", existingStock.id);
    } else {
      await supabase
        .from("finished_goods_stock")
        .insert({ product_id: productId, warehouse_id: warehouseId, quantity_pcs: qty });
    }

    // ৪. stock_ledger এন্ট্রি
    await supabase.from("stock_ledger").insert({
      item_type: "finished_goods",
      item_id: productId,
      warehouse_id: warehouseId,
      txn_type: "in",
      quantity: qty,
      reference_type: "production",
      reference_id: orderId,
      txn_date: receivedDate,
    });

    setLoading(false);
    router.push("/dashboard/production/finished-goods-receive");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-2xl">
      <div>
        <label className="block text-sm text-gray-600 mb-1">Production Order</label>
        <select
          value={orderId}
          onChange={(e) => handleOrderChange(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          required
        >
          <option value="">-- বাছুন --</option>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.production_no} — {o.bookings?.customers?.name} — {o.bookings?.finished_goods?.product_name} ({o.quantity_pcs} pcs)
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Warehouse</label>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="rounded-lg border px-3 py-2 text-sm min-w-[180px]" required>
            <option value="">-- বাছুন --</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Quantity (Pcs)</label>
          <input type="number" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-40" required />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Received Date</label>
          <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "Receive সেভ করুন"}
      </button>
    </form>
  );
}