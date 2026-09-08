"use client";
import { useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/formatDate";
import { formatMeasurement } from "@/lib/formatMeasurement";
import DeliveryStatusBadge from "./DeliveryStatusBadge";

const nf = new Intl.NumberFormat("en-US");

export default function ChallanRow({
  challan, piNo, isLatest, bkById = {},
}: { challan: any; piNo?: string; isLatest?: boolean; bkById?: Record<string, any> }) {
  const [open, setOpen] = useState(false);

  const items: any[] = challan.delivery_challan_items ?? [];
  const totalQty = items.reduce((s: number, i: any) => s + Number(i.quantity_pcs || 0), 0);
  const totalPackets = items.reduce((s: number, i: any) => s + Number(i.packets || 0), 0);
  const hasPackets = items.some((i: any) => i.packets != null);
  const productNames = Array.from(
    new Set(items.map((i: any) => i.print_label || i.finished_goods?.product_name).filter(Boolean)),
  ).join(", ");

  function measurementFor(item: any) {
    const b = bkById[item.booking_id];
    return b ? formatMeasurement(b) : "-";
  }

  return (
    <>
      <tr
        className="border-t cursor-pointer hover:bg-gray-50"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="px-3 py-2 text-center text-gray-400">{open ? "▾" : "▸"}</td>
        <td className="px-4 py-2 font-medium">{challan.challan_no}</td>
        <td className="px-4 py-2 text-gray-500">
          {formatDate(challan.challan_date)}
          {challan.creator?.full_name && <div className="text-[11px] text-gray-400">by {challan.creator.full_name}</div>}
        </td>
        <td className="px-4 py-2">{challan.customers?.name ?? "-"}</td>
        <td className="px-4 py-2">{challan.bookings?.booking_no ?? "-"}</td>
        <td className="px-4 py-2">{piNo || <span className="text-gray-400">-</span>}</td>
        <td className="px-4 py-2">{productNames}</td>
        <td className="px-4 py-2 text-right">{nf.format(totalQty)}</td>
        <td className="px-4 py-2">
          {challan.is_partial
            ? <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">Partial</span>
            : <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Full</span>}
        </td>
        <td className="px-4 py-2">
          <DeliveryStatusBadge currentStatus={challan.delivery_status ?? "challan_ready"} />
        </td>
        <td className="px-4 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
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

      {open && (
        <tr className="bg-gray-50/60">
          <td></td>
          <td colSpan={10} className="px-4 pb-3 pt-1">
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-left text-gray-500">
                  <tr>
                    <th className="px-3 py-1.5">Product</th>
                    <th className="px-3 py-1.5">Booking</th>
                    <th className="px-3 py-1.5">Measurement</th>
                    <th className="px-3 py-1.5 text-right">Quantity</th>
                    {hasPackets && <th className="px-3 py-1.5 text-right">Packets</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it: any) => (
                    <tr key={it.id} className="border-t">
                      <td className="px-3 py-1.5">{it.print_label || it.finished_goods?.product_name || "-"}</td>
                      <td className="px-3 py-1.5 text-gray-500">{bkById[it.booking_id]?.booking_no ?? challan.bookings?.booking_no ?? "-"}</td>
                      <td className="px-3 py-1.5 text-gray-600">{measurementFor(it)}</td>
                      <td className="px-3 py-1.5 text-right">{nf.format(Number(it.quantity_pcs || 0))} Pcs</td>
                      {hasPackets && <td className="px-3 py-1.5 text-right">{Number(it.packets || 0)} Pkts</td>}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-medium">
                    <td className="px-3 py-1.5 text-right" colSpan={3}>Total</td>
                    <td className="px-3 py-1.5 text-right">{nf.format(totalQty)} Pcs</td>
                    {hasPackets && <td className="px-3 py-1.5 text-right">{totalPackets} Pkts</td>}
                  </tr>
                </tfoot>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
