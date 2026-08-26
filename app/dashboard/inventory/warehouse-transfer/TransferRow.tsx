"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteWarehouseTransferCascade } from "@/lib/warehouseTransferDelete";

export default function TransferRow({ transfer }: { transfer: any }) {
  const router = useRouter();
  const supabase = createClient();

  async function handleDelete() {
    if (!window.confirm(`Transfer "${transfer.transfer_no}" মুছে ফেলতে চান? স্টক আগের অবস্থায় ফিরে যাবে।`)) return;

    const referenceType = transfer.transfer_type === "wastage" ? "wastage_transfer" : "stock_transfer";
    const result = await deleteWarehouseTransferCascade(supabase, transfer.id, referenceType);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-2 font-medium">{transfer.transfer_no}</td>
      <td className="px-4 py-2 text-gray-500">{transfer.transfer_date}</td>
      <td className="px-4 py-2">
        <span className={`rounded-full px-2 py-0.5 text-xs ${
          transfer.transfer_type === "wastage" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"
        }`}>
          {transfer.transfer_type === "wastage" ? "Wastage" : "Stock"}
        </span>
      </td>
      <td className="px-4 py-2">{transfer.raw_materials?.material_name ?? "-"}</td>
      <td className="px-4 py-2 text-gray-500">{transfer.from_warehouse?.name ?? "-"}</td>
      <td className="px-4 py-2 text-gray-500">{transfer.to_warehouse?.name ?? "-"}</td>
      <td className="px-4 py-2 text-right">
        {transfer.entered_quantity} {transfer.unit === "bags" ? "Bags" : "Lbs"}
        {transfer.unit === "bags" && (
          <span className="text-gray-400"> ({transfer.quantity_lbs.toFixed(2)} Lbs)</span>
        )}
      </td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <button onClick={handleDelete} className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">Delete</button>
      </td>
    </tr>
  );
}
