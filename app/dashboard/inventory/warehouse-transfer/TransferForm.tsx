"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";
import { getCurrentUserId } from "@/lib/currentUser";

const LBS_PER_BAG = 55;

type Warehouse = { id: string; name: string };
type Material = { id: string; material_name: string };
type Unit = "lbs" | "bags";
type TransferType = "stock" | "wastage";

export default function TransferForm({
  warehouses,
  materials,
}: {
  warehouses: Warehouse[];
  materials: Material[];
}) {
  const [transferType, setTransferType] = useState<TransferType>("stock");
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<Unit>("lbs");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
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

    const referenceType = transferType === "wastage" ? "wastage_transfer" : "stock_transfer";
    const transferNo = await generateNextDocNo(supabase, "warehouse_transfers", "transfer_no", "WT", "transfer_date", transferDate);
    const createdBy = await getCurrentUserId(supabase);

    const { data: transfer, error: transferError } = await supabase
      .from("warehouse_transfers")
      .insert({
        transfer_no: transferNo,
        transfer_type: transferType,
        from_warehouse_id: fromWarehouseId,
        to_warehouse_id: toWarehouseId,
        material_id: materialId,
        unit,
        entered_quantity: parseFloat(quantity),
        quantity_lbs: quantityLbs,
        transfer_date: transferDate,
        notes: notes || null,
        created_by: createdBy,
      })
      .select()
      .single();

    if (transferError || !transfer) {
      setLoading(false);
      setError(transferError?.message ?? "Warehouse Transfer তৈরি ব্যর্থ হয়েছে।");
      return;
    }

    // উৎস গুদাম থেকে কমানো
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

    // গন্তব্য গুদামে যোগ করা
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

    await supabase.from("stock_ledger").insert([
      {
        item_type: "raw_material", item_id: materialId, warehouse_id: fromWarehouseId,
        txn_type: "out", quantity: quantityLbs, reference_type: referenceType, reference_id: transfer.id, txn_date: transferDate,
      },
      {
        item_type: "raw_material", item_id: materialId, warehouse_id: toWarehouseId,
        txn_type: "in", quantity: quantityLbs, reference_type: referenceType, reference_id: transfer.id, txn_date: transferDate,
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
          <p className="text-sm text-gray-500 pb-2">= {quantityLbs.toFixed(2)} Lbs</p>
        )}
      </div>

      <div>
        <label className="block text-sm text-gray-600 mb-1">Notes</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : "Transfer সেভ করুন"}
      </button>
    </form>
  );
}
