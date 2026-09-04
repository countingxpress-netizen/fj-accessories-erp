"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { money } from "@/lib/format";

const LBS_PER_BAG = 55;

type Warehouse = { id: string; name: string };
type Material = { id: string; material_name: string };
type Unit = "lbs" | "bags";
type TransferType = "stock" | "wastage";
type Transfer = {
  id: string; transfer_no: string; transfer_type: TransferType;
  from_warehouse_id: string; to_warehouse_id: string; material_id: string;
  unit: Unit; entered_quantity: number; quantity_lbs: number;
  transfer_date: string; notes: string | null;
};

export default function EditTransferForm({
  transfer, warehouses, materials,
}: { transfer: Transfer; warehouses: Warehouse[]; materials: Material[] }) {
  const [transferType, setTransferType] = useState<TransferType>(transfer.transfer_type);
  const [fromWarehouseId, setFromWarehouseId] = useState(transfer.from_warehouse_id);
  const [toWarehouseId, setToWarehouseId] = useState(transfer.to_warehouse_id);
  const [materialId, setMaterialId] = useState(transfer.material_id);
  const [quantity, setQuantity] = useState(String(transfer.entered_quantity));
  const [unit, setUnit] = useState<Unit>(transfer.unit);
  const [transferDate, setTransferDate] = useState(transfer.transfer_date);
  const [notes, setNotes] = useState(transfer.notes ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const quantityLbs = (parseFloat(quantity) || 0) * (unit === "bags" ? LBS_PER_BAG : 1);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!fromWarehouseId || !toWarehouseId || !materialId || quantityLbs <= 0) {
      setError("From Warehouse, To Warehouse, Material এবং সঠিক Quantity দিতে হবে।");
      return;
    }
    if (fromWarehouseId === toWarehouseId) {
      setError("From ও To Warehouse একই হতে পারবে না।");
      return;
    }

    setLoading(true);

    // ১. পুরনো effect রিভার্স করা (আগের stock_ledger এন্ট্রি ধরে raw_material_stock ঠিক করা)
    const oldReferenceType = transfer.transfer_type === "wastage" ? "wastage_transfer" : "stock_transfer";
    const { data: oldLedgerEntries } = await supabase
      .from("stock_ledger").select("*").eq("reference_type", oldReferenceType).eq("reference_id", transfer.id);

    for (const entry of oldLedgerEntries ?? []) {
      const { data: stock } = await supabase
        .from("raw_material_stock").select("*")
        .eq("material_id", entry.item_id).eq("warehouse_id", entry.warehouse_id).maybeSingle();
      if (stock) {
        const delta = entry.txn_type === "in" ? -entry.quantity : entry.quantity;
        await supabase.from("raw_material_stock")
          .update({ quantity_lbs: stock.quantity_lbs + delta, updated_at: new Date().toISOString() })
          .eq("id", stock.id);
      }
    }
    await supabase.from("stock_ledger").delete().eq("reference_type", oldReferenceType).eq("reference_id", transfer.id);

    // ২. নতুন মান দিয়ে transfer আপডেট করা (transfer_no অপরিবর্তিত থাকবে)
    const { error: updateError } = await supabase
      .from("warehouse_transfers")
      .update({
        transfer_type: transferType,
        from_warehouse_id: fromWarehouseId,
        to_warehouse_id: toWarehouseId,
        material_id: materialId,
        unit,
        entered_quantity: parseFloat(quantity),
        quantity_lbs: quantityLbs,
        transfer_date: transferDate,
        notes: notes || null,
      })
      .eq("id", transfer.id);

    if (updateError) {
      setLoading(false);
      setError(updateError.message);
      return;
    }

    // ৩. নতুন effect প্রয়োগ করা
    const { data: fromStock } = await supabase
      .from("raw_material_stock").select("*")
      .eq("material_id", materialId).eq("warehouse_id", fromWarehouseId).maybeSingle();
    if (fromStock) {
      await supabase.from("raw_material_stock")
        .update({ quantity_lbs: fromStock.quantity_lbs - quantityLbs, updated_at: new Date().toISOString() })
        .eq("id", fromStock.id);
    } else {
      await supabase.from("raw_material_stock")
        .insert({ material_id: materialId, warehouse_id: fromWarehouseId, quantity_lbs: -quantityLbs });
    }

    const { data: toStock } = await supabase
      .from("raw_material_stock").select("*")
      .eq("material_id", materialId).eq("warehouse_id", toWarehouseId).maybeSingle();
    if (toStock) {
      await supabase.from("raw_material_stock")
        .update({ quantity_lbs: toStock.quantity_lbs + quantityLbs, updated_at: new Date().toISOString() })
        .eq("id", toStock.id);
    } else {
      await supabase.from("raw_material_stock")
        .insert({ material_id: materialId, warehouse_id: toWarehouseId, quantity_lbs: quantityLbs });
    }

    const newReferenceType = transferType === "wastage" ? "wastage_transfer" : "stock_transfer";
    await supabase.from("stock_ledger").insert([
      {
        item_type: "raw_material", item_id: materialId, warehouse_id: fromWarehouseId,
        txn_type: "out", quantity: quantityLbs, reference_type: newReferenceType, reference_id: transfer.id, txn_date: transferDate,
      },
      {
        item_type: "raw_material", item_id: materialId, warehouse_id: toWarehouseId,
        txn_type: "in", quantity: quantityLbs, reference_type: newReferenceType, reference_id: transfer.id, txn_date: transferDate,
      },
    ]);

    setLoading(false);
    router.push("/dashboard/inventory/warehouse-transfer");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-3xl">
      <div>
        <span className="block text-sm text-gray-600 mb-1">Transfer Type</span>
        <div className="flex gap-3 text-sm">
          <label className="flex items-center gap-1">
            <input type="radio" name="transferType" checked={transferType === "stock"} onChange={() => setTransferType("stock")} />
            Stock Transfer
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" name="transferType" checked={transferType === "wastage"} onChange={() => setTransferType("wastage")} />
            Wastage Transfer (রিসাইকেল চিপসের জন্য)
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">From Warehouse</label>
          <select value={fromWarehouseId} onChange={(e) => setFromWarehouseId(e.target.value)} className="rounded-lg border px-3 py-2 text-sm min-w-[180px]" required>
            <option value="">-- বাছুন --</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">To Warehouse</label>
          <select value={toWarehouseId} onChange={(e) => setToWarehouseId(e.target.value)} className="rounded-lg border px-3 py-2 text-sm min-w-[180px]" required>
            <option value="">-- বাছুন --</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Transfer Date</label>
          <input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Material</label>
          <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className="rounded-lg border px-3 py-2 text-sm min-w-[180px]" required>
            <option value="">-- বাছুন --</option>
            {materials.map((m) => <option key={m.id} value={m.id}>{m.material_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Quantity</label>
          <input type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-32" required />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Unit</label>
          <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} className="rounded-lg border px-3 py-2 text-sm">
            <option value="lbs">Lbs</option>
            <option value="bags">Bags</option>
          </select>
        </div>
        {quantity && (
          <p className="text-sm text-gray-500 pb-2">= {money(quantityLbs)} Lbs</p>
        )}
      </div>

      <div>
        <label className="block text-sm text-gray-600 mb-1">Notes</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "পরিবর্তন সেভ করুন"}
      </button>
    </form>
  );
}
