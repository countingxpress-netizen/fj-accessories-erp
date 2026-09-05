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

// একই Booking Group-এর একাধিক Measurement Row-এর মধ্যে সবচেয়ে পিছিয়ে থাকা
// ধাপটাই (bottleneck) সারাংশ Status হিসেবে দেখানো হয় — List-এ Group সংক্ষিপ্ত
// করে দেখানোর সময় ব্যবহৃত। সব row একই ধাপে না থাকলে `mixed: true`।
const STAGE_ORDER = ["Booking Received", "Blowing OK", "Printing OK", "Cutting OK"];

export function getGroupStatusSummary(
  items: any[],
  deliveredMap: Record<string, number>,
  challanNosByBooking: Record<string, string[]>
): StatusResult & { mixed: boolean } {
  const statuses = items.map((b) => getBookingStatusLabel(b, deliveredMap[b.id] ?? 0, challanNosByBooking[b.id] ?? []));
  const rank = (label: string) => {
    const idx = STAGE_ORDER.indexOf(label);
    return idx >= 0 ? idx : STAGE_ORDER.length; // Delivered/Delivered (Partial)/অন্য যেকোনো লেবেল সবচেয়ে এগিয়ে
  };
  const bottleneck = statuses.reduce((worst, s) => (rank(s.label) < rank(worst.label) ? s : worst));
  const mixed = !statuses.every((s) => s.label === statuses[0].label);
  return { ...bottleneck, mixed };
}