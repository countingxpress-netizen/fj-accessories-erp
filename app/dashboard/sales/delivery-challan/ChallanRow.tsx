import Link from "next/link";
import { formatDate } from "@/lib/formatDate";
import DeliveryStatusBadge from "./DeliveryStatusBadge";

export default function ChallanRow({
  challan, piNo, isLatest,
}: { challan: any; piNo?: string; isLatest?: boolean }) {
  const items = challan.delivery_challan_items ?? [];
  const totalQty = items.reduce((s: number, i: any) => s + Number(i.quantity_pcs || 0), 0);
  const productNames = Array.from(
    new Set(items.map((i: any) => i.print_label || i.finished_goods?.product_name).filter(Boolean)),
  ).join(", ");

  return (
    <tr className="border-t">
      <td className="px-4 py-2 font-medium">{challan.challan_no}</td>
      <td className="px-4 py-2 text-gray-500">
        {formatDate(challan.challan_date)}
        {challan.creator?.full_name && <div className="text-[11px] text-gray-400">by {challan.creator.full_name}</div>}
      </td>
      <td className="px-4 py-2">{challan.customers?.name ?? "-"}</td>
      <td className="px-4 py-2">{challan.bookings?.booking_no ?? "-"}</td>
      <td className="px-4 py-2">{piNo || <span className="text-gray-400">-</span>}</td>
      <td className="px-4 py-2">{productNames}</td>
      <td className="px-4 py-2 text-right">{totalQty}</td>
      <td className="px-4 py-2">
        {challan.is_partial
          ? <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">Partial</span>
          : <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Full</span>}
      </td>
      <td className="px-4 py-2">
        <DeliveryStatusBadge currentStatus={challan.delivery_status ?? "challan_ready"} />
      </td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        {isLatest && challan.delivery_status !== "challan_received" && (
          <Link
            href={`/dashboard/sales/delivery-challan/${challan.id}/edit`}
            className="text-gray-700 hover:underline text-xs mr-3"
          >
            Edit
          </Link>
        )}
        <Link
          href={`/dashboard/sales/delivery-challan/${challan.id}/print`}
          target="_blank"
          className="text-blue-700 hover:underline text-xs"
        >
          Print
        </Link>
      </td>
    </tr>
  );
}
