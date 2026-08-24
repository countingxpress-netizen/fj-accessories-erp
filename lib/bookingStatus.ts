export type StatusResult = { label: string; color: string };

export function getBookingStatusLabel(
  booking: any,
  deliveredQty: number,
  challanNos: string[]
): StatusResult {
  if (deliveredQty > 0) {
    const isPartial = deliveredQty < booking.quantity_pcs;
    const label = (challanNos.length ? challanNos.join(", ") : "Delivered") + (isPartial ? " (Partial Delivery)" : "");
    return {
      label,
      color: isPartial ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700",
    };
  }

  const po = booking.production_orders?.[0];
  if (po?.cutting_completed_at) return { label: "Cutting OK", color: "bg-purple-100 text-purple-700" };
  if (po?.printing_completed_at) return { label: "Printing OK", color: "bg-indigo-100 text-indigo-700" };
  if (po?.blowing_completed_at) return { label: "Blowing OK", color: "bg-blue-100 text-blue-700" };
  return { label: "Booking Received", color: "bg-gray-100 text-gray-700" };
}