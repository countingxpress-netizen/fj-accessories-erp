"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { StageRow } from "./page";

function stageColumn(stageType: string) {
  if (stageType === "blowing") return "blowing_produced_lbs";
  if (stageType === "printing") return "printing_produced_pcs";
  return "cutting_produced_pcs";
}
function completedColumn(stageType: string) {
  if (stageType === "blowing") return "blowing_completed_at";
  if (stageType === "printing") return "printing_completed_at";
  return "cutting_completed_at";
}

export default function ProductionStageRow({ row }: { row: StageRow }) {
  const [produced, setProduced] = useState(String(row.produced || ""));
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const producedNum = parseFloat(produced) || 0;
  const isDone = producedNum >= row.target && row.target > 0;

  async function handleSave() {
    setLoading(true);

    const wasCompleted = row.completed;
    const nowCompleted = producedNum >= row.target && row.target > 0;

    await supabase.from("production_orders").update({
      [stageColumn(row.stageType)]: producedNum,
      [completedColumn(row.stageType)]: nowCompleted ? new Date().toISOString() : null,
    }).eq("id", row.productionOrderId);

    if (row.stageType === "cutting" && nowCompleted && !wasCompleted) {
      await supabase.from("production_orders").update({ stage: "finished" }).eq("id", row.productionOrderId);

      // Finished Goods Receive অটো তৈরি করুন
      const targetWarehouseId = row.warehouseId;
      if (targetWarehouseId) {
        await supabase.from("finished_goods_receive").insert({
          production_id: row.productionOrderId, product_id: row.productId,
          quantity_pcs: row.target, received_date: new Date().toISOString().slice(0, 10),
        });

        const { data: stock } = await supabase
          .from("finished_goods_stock").select("*")
          .eq("product_id", row.productId).eq("warehouse_id", targetWarehouseId).maybeSingle();

        if (stock) {
          await supabase.from("finished_goods_stock")
            .update({ quantity_pcs: stock.quantity_pcs + row.target, updated_at: new Date().toISOString() })
            .eq("id", stock.id);
        } else {
          await supabase.from("finished_goods_stock")
            .insert({ product_id: row.productId, warehouse_id: targetWarehouseId, quantity_pcs: row.target });
        }

        await supabase.from("stock_ledger").insert({
          item_type: "finished_goods", item_id: row.productId, warehouse_id: targetWarehouseId,
          txn_type: "in", quantity: row.target, reference_type: "production",
          reference_id: row.productionOrderId, txn_date: new Date().toISOString().slice(0, 10),
        });
      }
    }

    setLoading(false);
    router.refresh();
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-2 font-medium">{row.bookingNo}</td>
      <td className="px-4 py-2">{row.customerName}</td>
      <td className="px-4 py-2">{row.productName}</td>
      <td className="px-4 py-2 text-gray-500 text-xs">{row.measurement}</td>
      <td className="px-4 py-2 text-right">{row.target.toLocaleString()} {row.quantityUnit}</td>
      <td className="px-4 py-2">
        <div className="flex gap-2 items-center">
          <input
            type="number" step="0.01" value={produced}
            onChange={(e) => setProduced(e.target.value)}
            className="w-24 rounded border px-2 py-1 text-sm"
          />
          <span className="text-xs text-gray-400">{row.quantityUnit}</span>
        </div>
      </td>
      <td className={`px-4 py-2 ${isDone ? "text-green-700 font-medium" : "text-orange-600"}`}>
        {isDone ? (row.stageType === "cutting" ? "OK — Finished to store" : "OK") : "চলছে"}
      </td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <button onClick={handleSave} disabled={loading} className="rounded bg-gray-900 px-3 py-1 text-xs text-white mr-2">
          {loading ? "সেভ হচ্ছে..." : "সেভ করুন"}
        </button>
        <Link href={`/dashboard/production/schedule-group/${row.groupId}?type=${row.stageType}`} target="_blank" className="text-xs text-blue-600 hover:underline">
          View
        </Link>
      </td>
    </tr>
  );
}