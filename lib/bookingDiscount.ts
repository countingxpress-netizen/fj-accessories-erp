// Booking Discount — PI-এর মতো পুরো Booking Group-এর মোট মূল্যের (Σ লাইন Amount) উপর Discount।
// bookings.discount_type / discount_value (group-এর সব row-এ একই — header ফিল্ডের মতো)।
// auto Sales Invoice-এ আলাদা একটা লাইন: line_type 'discount', qty 1, unit_price = −Discount টাকা।
// Invoice Amount পূর্ণ টাকায় (numeric(14,0)), তাই Discount-ও পূর্ণ টাকায় রাউন্ড হয়।

export type DiscountType = "none" | "percentage" | "fixed";

export const DISCOUNT_LINE_TYPE = "discount";

export function isDiscountLine(item: { line_type?: string | null } | null | undefined): boolean {
  return item?.line_type === DISCOUNT_LINE_TYPE;
}

export function normalizeDiscountType(t: unknown): DiscountType {
  return t === "percentage" || t === "fixed" ? t : "none";
}

/** মোট মূল্যের উপর Discount টাকা (পূর্ণ টাকা, মোটের বেশি নয়) */
export function calcBookingDiscount(subtotal: number, type: unknown, value: unknown): number {
  const t = normalizeDiscountType(type);
  const v = Number(value) || 0;
  if (t === "none" || v <= 0 || subtotal <= 0) return 0;
  const raw = t === "percentage" ? (subtotal * v) / 100 : v;
  return Math.min(Math.round(raw), Math.round(subtotal));
}

export function discountLabel(type: unknown, value: unknown): string {
  return normalizeDiscountType(type) === "percentage" ? `Discount (${Number(value) || 0}%)` : "Discount";
}
