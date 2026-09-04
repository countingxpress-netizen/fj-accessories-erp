"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { money } from "@/lib/format";

type Material = { id: string; material_name: string };
type Warehouse = { id: string; name: string };

export default function StockAdjustmentForm({
  materials,
  warehouses,
}: {
  materials: Material[];
  warehouses: Warehouse[];
}) {
  const [materialId, setMaterialId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [txnType, setTxnType] = useState<"in" | "out">("in");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("Opening Stock");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const qty = parseFloat(quantity);
    if (!materialId || !warehouseId || !qty || qty <= 0) {
      setError("সব ফিল্ড ঠিকমতো পূরণ করুন। পরিমাণ শূন্যের বেশি হতে হবে।");
      return;
    }

    setLoading(true);

    // বর্তমান stock row খুঁজুন (material + warehouse combination)
    const { data: existing } = await supabase
      .from("raw_material_stock")
      .select("*")
      .eq("material_id", materialId)
      .eq("warehouse_id", warehouseId)
      .maybeSingle();

    const currentQty = existing?.quantity_lbs ?? 0;
    const newQty = txnType === "in" ? currentQty + qty : currentQty - qty;

    if (newQty < 0) {
      setLoading(false);
      setError(`পর্যাপ্ত স্টক নেই। বর্তমান স্টক: ${money(currentQty)} Lbs`);
      return;
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from("raw_material_stock")
        .update({ quantity_lbs: newQty, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (updateError) {
        setLoading(false);
        setError(updateError.message);
        return;
      }
    } else {
      const { error: insertError } = await supabase
        .from("raw_material_stock")
        .insert({ material_id: materialId, warehouse_id: warehouseId, quantity_lbs: newQty });
      if (insertError) {
        setLoading(false);
        setError(insertError.message);
        return;
      }
    }

    // Stock Ledger-এ এন্ট্রি লিখুন (audit trail)
    const { error: ledgerError } = await supabase.from("stock_ledger").insert({
      item_type: "raw_material",
      item_id: materialId,
      warehouse_id: warehouseId,
      txn_type: txnType,
      quantity: qty,
      reference_type: "manual_adjustment",
      txn_date: new Date().toISOString().slice(0, 10),
    });

    setLoading(false);

    if (ledgerError) {
      setError(ledgerError.message);
      return;
    }

    setQuantity("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-4 shadow-sm mb-6 space-y-3">
      <h2 className="font-semibold text-gray-800">স্টক এডজাস্টমেন্ট (In / Out)</h2>
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Material</label>
          <select
            value={materialId}
            onChange={(e) => setMaterialId(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm min-w-[180px]"
          >
            <option value="">-- বাছুন --</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>{m.material_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Warehouse</label>
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm min-w-[180px]"
          >
            <option value="">-- বাছুন --</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Type</label>
          <select
            value={txnType}
            onChange={(e) => setTxnType(e.target.value as "in" | "out")}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            <option value="in">In (স্টক বাড়ান)</option>
            <option value="out">Out (স্টক কমান)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Quantity (Lbs)</label>
          <input
            type="number"
            step="0.01"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm w-32"
            placeholder="0.00"
          />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs text-gray-500 mb-1">Reason / Note</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>
        <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {loading ? "সেভ হচ্ছে..." : "সেভ করুন"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}