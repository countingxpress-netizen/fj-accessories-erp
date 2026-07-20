"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ProductionOrder = {
  id: string; production_no: string; stage: string;
  bookings: { booking_no: string; required_lbs: number; customers: { name: string } | null } | null;
};
type Warehouse = { id: string; name: string };

export default function WastageForm({
  orders, warehouses,
}: { orders: ProductionOrder[]; warehouses: Warehouse[] }) {
  const [productionId, setProductionId] = useState("");
  const [stage, setStage] = useState<"blowing" | "printing" | "cutting">("blowing");
  const [quantity, setQuantity] = useState("");
  const [recycled, setRecycled] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const [wastageDate, setWastageDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const selectedOrder = orders.find((o) => o.id === productionId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const qty = parseFloat(quantity);
    if (!productionId || !qty || qty <= 0) {
      setError("Production Order এবং সঠিক Quantity দিন।");
      return;
    }
    if (recycled && !warehouseId) {
      setError("Recycled Chips হিসেবে ফেরত দিতে চাইলে Warehouse বাছুন।");
      return;
    }

    setLoading(true);

    const { error: wastageError } = await supabase.from("wastage").insert({
      production_id: productionId, stage, quantity_lbs: qty, recycled, wastage_date: wastageDate,
    });

    if (wastageError) {
      setLoading(false);
      setError(wastageError.message);
      return;
    }

    if (recycled) {
      const { data: recycledMaterial } = await supabase
        .from("raw_materials").select("id").eq("material_name", "Recycled Chips").single();

      if (recycledMaterial) {
        const { data: stock } = await supabase
          .from("raw_material_stock").select("*")
          .eq("material_id", recycledMaterial.id).eq("warehouse_id", warehouseId).maybeSingle();

        if (stock) {
          await supabase.from("raw_material_stock")
            .update({ quantity_lbs: stock.quantity_lbs + qty, updated_at: new Date().toISOString() })
            .eq("id", stock.id);
        } else {
          await supabase.from("raw_material_stock")
            .insert({ material_id: recycledMaterial.id, warehouse_id: warehouseId, quantity_lbs: qty });
        }

        await supabase.from("stock_ledger").insert({
          item_type: "raw_material", item_id: recycledMaterial.id, warehouse_id: warehouseId,
          txn_type: "in", quantity: qty, reference_type: "wastage", reference_id: productionId, txn_date: wastageDate,
        });
      }
    }

    setLoading(false);
    setQuantity("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-2xl">
      <div>
        <label className="block text-sm text-gray-600 mb-1">Production Order</label>
        <select value={productionId} onChange={(e) => setProductionId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" required>
          <option value="">-- বাছুন --</option>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.production_no} — {o.bookings?.customers?.name} — {o.bookings?.booking_no}
            </option>
          ))}
        </select>
      </div>

      {selectedOrder?.bookings && (
        <p className="text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          এই বুকিং-এর মোট Required Lbs: <strong>{selectedOrder.bookings.required_lbs?.toFixed(2)} Lbs</strong>
        </p>
      )}

      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Stage</label>
          <select value={stage} onChange={(e) => setStage(e.target.value as any)} className="rounded-lg border px-3 py-2 text-sm">
            <option value="blowing">Blowing</option>
            <option value="printing">Printing</option>
            <option value="cutting">Cutting</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Quantity (Lbs)</label>
          <input type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-36" required />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Wastage Date</label>
          <input type="date" value={wastageDate} onChange={(e) => setWastageDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
        </div>
      </div>

      <div className="rounded-lg border p-4 bg-gray-50 space-y-3">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={recycled} onChange={(e) => setRecycled(e.target.checked)} />
          এই ওয়েস্টেজ Recycled Chips হিসেবে স্টকে ফেরত যাবে
        </label>
        {recycled && (
          <div>
            <label className="block text-sm text-gray-600 mb-1">কোন গুদামে ফেরত যাবে</label>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="rounded-lg border px-3 py-2 text-sm min-w-[200px]">
              <option value="">-- বাছুন --</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "Wastage সেভ করুন"}
      </button>
    </form>
  );
}