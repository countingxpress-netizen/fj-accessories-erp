"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";
import DeliveryStatusBadge from "./DeliveryStatusBadge";
import { deleteChallanCascade } from "@/lib/challanDelete";
import GuardedAction from "@/app/dashboard/GuardedAction";

export default function ChallanRow({
  challan, selected, onToggleSelect,
}: { challan: any; selected?: boolean; onToggleSelect?: () => void }) {
  const router = useRouter();
  const supabase = createClient();

  const items = challan.delivery_challan_items ?? [];
  const totalQty = items.reduce((s: number, i: any) => s + i.quantity_pcs, 0);
  const productNames = Array.from(new Set(items.map((i: any) => i.finished_goods?.product_name))).join(", ");

  async function handleDelete() {
    if (!window.confirm(`Challan "${challan.challan_no}" মুছে ফেলতে চান? স্টক আগের অবস্থায় ফিরে আসবে।`)) return;

    const result = await deleteChallanCascade(supabase, challan.id, challan.booking_id);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-2">
        <input
          type="checkbox"
          checked={!!selected}
          onChange={onToggleSelect}
          aria-label={`Select challan ${challan.challan_no}`}
        />
      </td>
      <td className="px-4 py-2 font-medium">{challan.challan_no}</td>
      <td className="px-4 py-2 text-gray-500">
        {formatDate(challan.challan_date)}
        {challan.creator?.full_name && <div className="text-[11px] text-gray-400">by {challan.creator.full_name}</div>}
      </td>
      <td className="px-4 py-2">{challan.customers?.name ?? "-"}</td>
      <td className="px-4 py-2">{challan.bookings?.booking_no ?? "-"}</td>
      <td className="px-4 py-2">{productNames}</td>
      <td className="px-4 py-2 text-right">{totalQty}</td>
      <td className="px-4 py-2">
        {challan.is_partial ? <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">Partial</span> : <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Full</span>}
      </td>

    <td className="px-4 py-2">
        <DeliveryStatusBadge challanId={challan.id} currentStatus={challan.delivery_status ?? "challan_ready"} />
      </td>

      <td className="px-4 py-2 text-right whitespace-nowrap">
        <Link href={`/dashboard/sales/delivery-challan/${challan.id}/print`} target="_blank" className="text-blue-700 hover:underline text-xs mr-2">Print</Link>
        <GuardedAction table="delivery_challans" recordId={challan.id} recordLabel={challan.challan_no} action="delete"
          onAllowed={handleDelete}
          className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">Delete</GuardedAction>
      </td>
    </tr>
  );
}
