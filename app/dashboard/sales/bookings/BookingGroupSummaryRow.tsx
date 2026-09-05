"use client";
import Link from "next/link";
import { formatDate } from "@/lib/formatDate";
import { getGroupStatusSummary } from "@/lib/bookingStatus";
import { money } from "@/lib/format";

export default function BookingGroupSummaryRow({
  items, serial, groupPiNo, deliveredMap, challanNosByBooking,
  expanded, onToggleExpand, allSelected, someSelected, onToggleSelectGroup,
}: {
  items: any[]; serial: number; groupPiNo: string;
  deliveredMap: Record<string, number>; challanNosByBooking: Record<string, string[]>;
  expanded: boolean; onToggleExpand: () => void;
  allSelected: boolean; someSelected: boolean; onToggleSelectGroup: () => void;
}) {
  const first = items[0];
  const totalQty = items.reduce((s, b) => s + (b.quantity_pcs || 0), 0);
  const totalLbs = items.reduce((s, b) => s + (b.required_lbs || 0), 0);
  const status = getGroupStatusSummary(items, deliveredMap, challanNosByBooking);

  return (
    <tr className="border-t-2 border-t-blue-200 bg-blue-50/40">
      <td className="px-4 py-1.5">
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
          onChange={onToggleSelectGroup}
          aria-label={`Select all in booking ${first.booking_no}`}
        />
      </td>
      <td className="px-4 py-1.5 text-gray-500">{serial}</td>
      <td className="px-4 py-1.5 font-medium">
        <button type="button" onClick={onToggleExpand} className="inline-flex items-center gap-1.5 hover:underline">
          <span className="text-gray-400 text-[10px] w-3 inline-block">{expanded ? "▼" : "▶"}</span>
          {first.booking_no}
        </button>
        <span className="ml-1 text-xs text-blue-600 font-normal">({items.length}টি প্রোডাক্ট)</span>
      </td>
      <td className="px-4 py-1.5 text-gray-500">
        {formatDate(first.booking_date)}
        {first.creator?.full_name && <div className="text-[11px] text-gray-400">by {first.creator.full_name}</div>}
      </td>
      <td className="px-4 py-1.5">{first.customers?.name ?? "-"}</td>
      <td className="px-4 py-1.5 text-gray-500">{first.buyers?.name ?? "-"}</td>
      <td className="px-4 py-1.5 text-gray-500">{first.garments_name ?? "-"}</td>
      <td className="px-4 py-1.5 text-xs text-gray-500 italic">{items.length}টি সাইজ</td>
      <td className="px-4 py-1.5 text-right font-medium">{totalQty.toLocaleString("en-IN")}</td>
      <td className="px-4 py-1.5 text-right font-medium">{money(totalLbs)}</td>
      <td className="px-4 py-1.5">
        <span className={`rounded-full px-2 py-0.5 text-xs ${status.color}`}>
          {status.label}{status.mixed ? " (মিশ্র)" : ""}
        </span>
      </td>
      <td className="px-4 py-1.5 font-medium text-xs">
        {groupPiNo ? <span className="text-blue-700">{groupPiNo}</span> : <span className="text-gray-400 font-normal">-</span>}
      </td>
      <td className="px-4 py-1.5 text-right">
        <Link href={`/dashboard/sales/bookings/${first.id}`} className="rounded bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200">
          View
        </Link>
      </td>
    </tr>
  );
}
