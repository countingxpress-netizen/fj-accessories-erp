"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";
import { getBookingStatusLabel } from "@/lib/bookingStatus";
import { formatStyle } from "@/lib/formatStyle";
import { deleteBookingCascade } from "@/lib/bookingDelete";
import GuardedAction from "@/app/dashboard/GuardedAction";

function formatMeasurement(b: any) {
  const unit = b.measurement_unit;
  const L = b.length_val, W = b.width_val, F = b.flap_val, G = b.gusset_val;

  if (b.measurement_type === "simple") return `L-${L} x W-${W} ${unit}`;
  if (b.measurement_type === "gusset") return `L-${L} x W-${W} + G-${G} ${unit}`;
  if (b.measurement_type === "adhesive") return `L-${L} + F-${F} x W-${W} ${unit}`;
  return "-";
}

export default function BookingRow({
  booking, serial, isGroupStart, groupSize, deliveredQty, challanNos, selected, onToggleSelect,
}: {
  booking: any; serial?: number; isGroupStart?: boolean; groupSize?: number; deliveredQty: number; challanNos: string[];
  selected?: boolean; onToggleSelect?: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();

  async function handleDelete() {
    if (!window.confirm(`Booking "${booking.booking_no}" মুছে ফেলতে চান? এর সাথে যুক্ত Production Order, স্টক কর্তন সবকিছু ফেরত/মুছে যাবে।`)) return;

    const result = await deleteBookingCascade(supabase, booking.id);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    router.refresh();
  }

  const groupBg = groupSize && groupSize > 1 ? "bg-blue-50/40" : "";
    const status = getBookingStatusLabel(booking, deliveredQty, challanNos);

  const piNo = booking.pi_bookings?.[0]?.proforma_invoices?.pi_no ?? null;

  return (
    <tr className={`border-t ${groupBg} ${isGroupStart && groupSize && groupSize > 1 ? "border-t-2 border-t-blue-200" : ""}`}>
      <td className="px-4 py-2">
        <input
          type="checkbox"
          checked={!!selected}
          onChange={onToggleSelect}
          aria-label={`Select booking ${booking.booking_no}`}
        />
      </td>
      <td className="px-4 py-2 text-gray-500">{serial ?? ""}</td>
      <td className="px-4 py-2 font-medium">
        {booking.booking_no}
        {groupSize && groupSize > 1 && (
          <span className="ml-1 text-xs text-blue-600">({groupSize}টি প্রোডাক্ট)</span>
        )}
      </td>
      <td className="px-4 py-2 text-gray-500">
        {formatDate(booking.booking_date)}
        {booking.creator?.full_name && <div className="text-[11px] text-gray-400">by {booking.creator.full_name}</div>}
      </td>
      <td className="px-4 py-2">{booking.customers?.name ?? "-"}</td>
      <td className="px-4 py-2 text-gray-500">{booking.buyers?.name ?? "-"}</td>
      <td className="px-4 py-2 text-gray-500">{booking.garments_name ?? "-"}</td>
      <td className="px-4 py-2 text-sm">{formatMeasurement(booking)}</td>
      <td className="px-4 py-2 text-right">{booking.quantity_pcs?.toLocaleString()}</td>
      <td className="px-4 py-2 text-right">{booking.required_lbs?.toFixed(2)}</td>
      <td className="px-4 py-2">
        <span className={`rounded-full px-2 py-0.5 text-xs ${status.color}`}>{status.label}</span>
      </td>
      <td className="px-4 py-2 font-medium text-xs">
        {piNo ? (
          <span className="text-blue-700">{piNo}</span>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </td>
      <td className="px-4 py-2 text-right">
        <details className="relative inline-block text-left">
          <summary className="cursor-pointer list-none rounded bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200 select-none">
            Action ▾
          </summary>
          <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border bg-white shadow-lg py-1 text-left">
            <Link href={`/dashboard/sales/bookings/${booking.id}`} className="block px-3 py-1.5 text-xs hover:bg-gray-50">View</Link>
            <GuardedAction
              table="bookings" recordId={booking.id} recordLabel={booking.booking_no} action="edit"
              onAllowed={() => router.push(`/dashboard/sales/bookings/${booking.id}/edit`)}
              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50"
            >
              Edit
            </GuardedAction>
            <GuardedAction
              table="bookings" recordId={booking.id} recordLabel={booking.booking_no} action="delete"
              onAllowed={handleDelete}
              className="block w-full text-left px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
            >
              Delete
            </GuardedAction>
          </div>
        </details>
      </td>
    </tr>
  );
}
