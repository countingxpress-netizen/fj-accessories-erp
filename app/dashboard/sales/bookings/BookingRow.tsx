"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";
import { getBookingStatusLabel } from "@/lib/bookingStatus";
import { formatStyle } from "@/lib/formatStyle";
import { deleteBookingCascade } from "@/lib/bookingDelete";
import GuardedAction from "@/app/dashboard/GuardedAction";
import { money } from "@/lib/format";

function formatMeasurement(b: any) {
  const unit = b.measurement_unit;
  const L = b.length_val, W = b.width_val, F = b.flap_val, G = b.gusset_val;

  if (b.measurement_type === "simple") return `L-${L} x W-${W} ${unit}`;
  if (b.measurement_type === "gusset") return `L-${L} x W-${W} + G-${G} ${unit}`;
  if (b.measurement_type === "adhesive") return `L-${L} + F-${F} x W-${W} ${unit}`;
  return "-";
}

export default function BookingRow({
  booking, serial, groupPiNo, deliveredQty, challanNos, selected, onToggleSelect, variant = "full",
}: {
  booking: any; serial?: number; groupPiNo: string;
  deliveredQty: number; challanNos: string[];
  selected?: boolean; onToggleSelect?: () => void;
  /** "detail" রো — এক্সপ্যান্ড করা Booking Group-এর ভেতরে দেখানো হয়, তাই SL/Booking No/Date/
   * Customer/Buyer/Garments আলাদা করে না দেখিয়ে একটাই ইনডেন্ট করা লেবেল সেলে দেখায় (ওগুলো
   * ইতিমধ্যে BookingGroupSummaryRow-তে আছে)। */
  variant?: "full" | "detail";
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

  const status = getBookingStatusLabel(booking, deliveredQty, challanNos);
  const rowPad = variant === "detail" ? "py-1" : "py-1.5";

  if (variant === "detail") {
    const label = [booking.style ? formatStyle(booking.style) : "", booking.product_details || booking.customer_booking_ref]
      .filter(Boolean).join(" — ");
    return (
      <tr className="border-t bg-blue-50/10">
        <td className={`px-4 ${rowPad}`}>
          <input type="checkbox" checked={!!selected} onChange={onToggleSelect} aria-label={`Select booking ${booking.booking_no}`} />
        </td>
        <td className={`px-4 ${rowPad} text-xs text-gray-400`} colSpan={6}>
          <span className="text-gray-300 mr-1">↳</span>{label || "-"}
        </td>
        <td className={`px-4 ${rowPad} text-sm`}>{formatMeasurement(booking)}</td>
        <td className={`px-4 ${rowPad} text-right`}>{booking.quantity_pcs?.toLocaleString("en-IN")}</td>
        <td className={`px-4 ${rowPad} text-right`}>{money(booking.required_lbs)}</td>
        <td className={`px-4 ${rowPad}`}>
          <span className={`rounded-full px-2 py-0.5 text-xs ${status.color}`}>{status.label}</span>
        </td>
        <td className={`px-4 ${rowPad}`}></td>
        <td className={`px-4 ${rowPad} text-right`}>
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

  return (
    <tr className="border-t">
      <td className={`px-4 ${rowPad}`}>
        <input
          type="checkbox"
          checked={!!selected}
          onChange={onToggleSelect}
          aria-label={`Select booking ${booking.booking_no}`}
        />
      </td>
      <td className={`px-4 ${rowPad} text-gray-500`}>{serial ?? ""}</td>
      <td className={`px-4 ${rowPad} font-medium`}>{booking.booking_no}</td>
      <td className={`px-4 ${rowPad} text-gray-500`}>
        {formatDate(booking.booking_date)}
        {booking.creator?.full_name && <div className="text-[11px] text-gray-400">by {booking.creator.full_name}</div>}
      </td>
      <td className={`px-4 ${rowPad}`}>{booking.customers?.name ?? "-"}</td>
      <td className={`px-4 ${rowPad} text-gray-500`}>{booking.buyers?.name ?? "-"}</td>
      <td className={`px-4 ${rowPad} text-gray-500`}>{booking.garments_name ?? "-"}</td>
      <td className={`px-4 ${rowPad} text-sm`}>{formatMeasurement(booking)}</td>
      <td className={`px-4 ${rowPad} text-right`}>{booking.quantity_pcs?.toLocaleString("en-IN")}</td>
      <td className={`px-4 ${rowPad} text-right`}>{money(booking.required_lbs)}</td>
      <td className={`px-4 ${rowPad}`}>
        <span className={`rounded-full px-2 py-0.5 text-xs ${status.color}`}>{status.label}</span>
      </td>
      <td className={`px-4 ${rowPad} font-medium text-xs`}>
        {groupPiNo ? (
          <span className="text-blue-700">{groupPiNo}</span>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </td>
      <td className={`px-4 ${rowPad} text-right`}>
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
