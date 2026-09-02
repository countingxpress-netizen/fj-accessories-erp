"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";
import { postWastageJv, reverseInventoryJv } from "@/lib/inventoryCost";
import GuardedAction from "@/app/dashboard/GuardedAction";

const stageLabels: Record<string, string> = { blowing: "Blowing", printing: "Printing", cutting: "Cutting" };

export default function WastageRow({ wastage, warehouses }: { wastage: any; warehouses: { id: string; name: string }[] }) {
  const [editing, setEditing] = useState(false);
  const [stage, setStage] = useState(wastage.stage);
  const [quantity, setQuantity] = useState(String(wastage.quantity_lbs));
  const [recycled, setRecycled] = useState(wastage.recycled);
  const [warehouseId, setWarehouseId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function reverseOldRecycledStock() {
    if (!wastage.recycled) return;
    // পুরনো stock_ledger এন্ট্রি খুঁজে সেই warehouse থেকে সমপরিমাণ Recycled Chips বিয়োগ করুন
    const { data: ledgerEntry } = await supabase
      .from("stock_ledger")
      .select("*")
      .eq("reference_type", "wastage")
      .eq("reference_id", wastage.production_id)
      .eq("quantity", wastage.quantity_lbs)
      .eq("txn_date", wastage.wastage_date)
      .maybeSingle();

    if (ledgerEntry) {
      const { data: stock } = await supabase
        .from("raw_material_stock").select("*")
        .eq("material_id", ledgerEntry.item_id).eq("warehouse_id", ledgerEntry.warehouse_id).maybeSingle();
      if (stock) {
        await supabase.from("raw_material_stock")
          .update({ quantity_lbs: stock.quantity_lbs - wastage.quantity_lbs, updated_at: new Date().toISOString() })
          .eq("id", stock.id);
      }
      await supabase.from("stock_ledger").delete().eq("id", ledgerEntry.id);
    }
  }

  async function handleSave() {
    setError("");
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) { setError("সঠিক Quantity দিন।"); return; }
    if (recycled && !wastage.recycled && !warehouseId) { setError("Warehouse বাছুন।"); return; }

    setLoading(true);

    // আগে recycled ছিল এবং এখনও আছে বা বাদ দেওয়া হচ্ছে — পুরনোটা রিভার্স করুন
    await reverseOldRecycledStock();
    // পুরনো inventory JV উল্টে দিন (WIP cost ফেরত), পরে নতুন অঙ্কে আবার বসবে
    await reverseInventoryJv(supabase, wastage.inventory_voucher_id, { restoreWipToProductionOrderId: wastage.production_id });

    await supabase.from("wastage").update({ stage, quantity_lbs: qty, recycled }).eq("id", wastage.id);

    if (recycled) {
      const { data: recycledMaterial } = await supabase.from("raw_materials").select("id").eq("material_name", "Recycled Chips").single();
      const targetWarehouseId = warehouseId || null;
      if (recycledMaterial && targetWarehouseId) {
        const { data: stock } = await supabase
          .from("raw_material_stock").select("*")
          .eq("material_id", recycledMaterial.id).eq("warehouse_id", targetWarehouseId).maybeSingle();
        if (stock) {
          await supabase.from("raw_material_stock")
            .update({ quantity_lbs: stock.quantity_lbs + qty, updated_at: new Date().toISOString() })
            .eq("id", stock.id);
        } else {
          await supabase.from("raw_material_stock").insert({ material_id: recycledMaterial.id, warehouse_id: targetWarehouseId, quantity_lbs: qty });
        }
        await supabase.from("stock_ledger").insert({
          item_type: "raw_material", item_id: recycledMaterial.id, warehouse_id: targetWarehouseId,
          txn_type: "in", quantity: qty, reference_type: "wastage", reference_id: wastage.production_id, txn_date: wastage.wastage_date,
        });
      }
    }

    // নতুন অঙ্কে inventory JV আবার বসান
    const wjv = await postWastageJv(supabase, {
      date: wastage.wastage_date,
      productionOrderId: wastage.production_id,
      productionNo: wastage.production_orders?.production_no ?? "",
      qtyLbs: qty,
      recycledQtyLbs: recycled ? qty : 0,
    });
    await supabase.from("wastage").update({ inventory_voucher_id: wjv ?? null }).eq("id", wastage.id);

    setLoading(false);
    setEditing(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!window.confirm("এই Wastage এন্ট্রি মুছে ফেলতে চান? Recycled স্টক ও inventory JV তাও উল্টে যাবে।")) return;
    setLoading(true);
    await reverseOldRecycledStock();
    await reverseInventoryJv(supabase, wastage.inventory_voucher_id, { restoreWipToProductionOrderId: wastage.production_id });
    const { error } = await supabase.from("wastage").delete().eq("id", wastage.id);
    setLoading(false);
    if (error) { alert("মুছে ফেলা যায়নি: " + error.message); return; }
    router.refresh();
  }

  if (editing) {
    return (
      <tr className="border-t bg-yellow-50">
        <td className="px-4 py-2 text-gray-500">{formatDate(wastage.wastage_date)}</td>
        <td className="px-4 py-2 font-medium">{wastage.production_orders?.production_no ?? "-"}</td>
        <td className="px-4 py-2 text-gray-600">{wastage.production_orders?.bookings?.customers?.name ?? "-"}</td>
        <td className="px-4 py-2">
          <select value={stage} onChange={(e) => setStage(e.target.value)} className="rounded border px-2 py-1 text-sm">
            <option value="blowing">Blowing</option>
            <option value="printing">Printing</option>
            <option value="cutting">Cutting</option>
          </select>
        </td>
        <td className="px-4 py-2"><input type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-24 rounded border px-2 py-1 text-sm" /></td>
        <td className="px-4 py-2">
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={recycled} onChange={(e) => setRecycled(e.target.checked)} /> Recycled
          </label>
          {recycled && !wastage.recycled && (
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="mt-1 rounded border px-2 py-1 text-xs">
              <option value="">Warehouse</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          )}
        </td>
        <td className="px-4 py-2 text-right whitespace-nowrap">
          <button onClick={handleSave} disabled={loading} className="rounded bg-green-600 px-3 py-1 text-xs text-white mr-1">সেভ</button>
          <button onClick={() => setEditing(false)} className="rounded bg-gray-200 px-3 py-1 text-xs text-gray-700">বাতিল</button>
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-2 text-gray-500">
        {formatDate(wastage.wastage_date)}
        {wastage.creator?.full_name && <div className="text-[11px] text-gray-400">by {wastage.creator.full_name}</div>}
      </td>
      <td className="px-4 py-2 font-medium">{wastage.production_orders?.production_no ?? "-"}</td>
      <td className="px-4 py-2 text-gray-600">
        {wastage.production_orders?.bookings?.customers?.name ?? "-"} / {wastage.production_orders?.bookings?.booking_no ?? "-"}
      </td>
      <td className="px-4 py-2">{stageLabels[wastage.stage] ?? wastage.stage}</td>
      <td className="px-4 py-2 text-right">{wastage.quantity_lbs.toFixed(2)}</td>
      <td className="px-4 py-2">
        {wastage.recycled ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Yes</span> : <span className="text-gray-400 text-xs">No</span>}
      </td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <GuardedAction table="wastage" recordId={wastage.id} recordLabel={`${wastage.production_orders?.production_no ?? ""} ${formatDate(wastage.wastage_date)}`} action="edit"
          onAllowed={() => setEditing(true)}
          className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 mr-2 hover:bg-blue-100">Edit</GuardedAction>
        <GuardedAction table="wastage" recordId={wastage.id} recordLabel={`${wastage.production_orders?.production_no ?? ""} ${formatDate(wastage.wastage_date)}`} action="delete"
          onAllowed={handleDelete} disabled={loading}
          className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">Delete</GuardedAction>
      </td>
    </tr>
  );
}