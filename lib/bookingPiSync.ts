import type { SupabaseClient } from "@supabase/supabase-js";
import { formatMeasurement } from "@/lib/formatMeasurement";

// Booking এডিট হলে তার PI লাইন booking-এর সাথে মিলিয়ে দেওয়া (lib/bookingGroupWrite.ts →
// updateBookingGroupInPlace থেকে ডাকা হয়)। booking id এডিটে বদলায় না, তাই লিংক অক্ষত থাকে।
//   • Qty, মাপ (measurement), Description, PI Thickness — সবসময় booking থেকে নতুন করে বসে
//     (PI-তে হাতে বদলানো থাকলেও)।
//   • Price/Unit এখনো বদলায় না (মাপ অনুযায়ী অটো দাম — পরে করা হবে)।
//   • প্রতিটা প্রভাবিত PI-র total নতুন করে (EditProformaForm-এর মতো: প্রতি লাইন round2, তারপর discount)।
//   • এডিটে মুছে দেওয়া প্রোডাক্টের PI লাইন মুছে যায় (deletePiLinesForBookings)।

type Client = SupabaseClient | any;

type BookingForPi = {
  id: string; booking_no: string; style: string | null; customer_booking_ref: string | null;
  quantity_pcs: number; pi_thickness_mm: number | null;
  measurement_type: string; measurement_unit: string;
  length_val: number; width_val: number; flap_val: number | null; gusset_val: number | null; pillow_val: number | null;
};

// ProformaForm / EditProformaForm-এর buildBookingDescription()-এর হুবহু কপি (PI লাইনের ডিফল্ট Description)
export function piBookingDescription(b: { booking_no: string; style: string | null; customer_booking_ref: string | null }): string {
  const parts: string[] = [];
  const style = b.style?.trim();
  const ref = b.customer_booking_ref?.trim();
  if (style) parts.push(/^st[-\s]/i.test(style) ? style : `St-${style}`);
  if (ref) parts.push(/^bn[-\s]/i.test(ref) ? ref : `BN-${ref}`);
  return parts.join("\n") || b.booking_no;
}

export async function syncPiLinesForBookings(supabase: Client, bookingIds: string[]): Promise<void> {
  if (bookingIds.length === 0) return;
  const { data: items } = await supabase.from("pi_items").select("id, pi_id, booking_id").in("booking_id", bookingIds);
  if (!items || items.length === 0) return;

  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, booking_no, style, customer_booking_ref, quantity_pcs, pi_thickness_mm, measurement_type, measurement_unit, length_val, width_val, flap_val, gusset_val, pillow_val")
    .in("id", bookingIds);
  const byId = new Map<string, BookingForPi>(((bookings ?? []) as BookingForPi[]).map((b) => [b.id, b]));

  for (const it of items as any[]) {
    const b = byId.get(it.booking_id);
    if (!b) continue;
    const patch: Record<string, unknown> = {
      qty_pcs: b.quantity_pcs,
      measurement: formatMeasurement(b as any),
      description: piBookingDescription(b),
    };
    if (Number(b.pi_thickness_mm) > 0) patch.pi_thickness_mm = b.pi_thickness_mm;
    await supabase.from("pi_items").update(patch).eq("id", it.id);
  }

  for (const piId of new Set((items as any[]).map((i) => i.pi_id as string))) await recomputePiTotal(supabase, piId);
}

export async function deletePiLinesForBookings(supabase: Client, bookingIds: string[]): Promise<void> {
  if (bookingIds.length === 0) return;
  const { data: items } = await supabase.from("pi_items").select("id, pi_id").in("booking_id", bookingIds);
  if (!items || items.length === 0) return;
  await supabase.from("pi_items").delete().in("id", (items as any[]).map((i) => i.id));

  for (const piId of new Set((items as any[]).map((i) => i.pi_id as string))) {
    // বাকি লাইনগুলোর SL নম্বর আবার 1, 2, 3...
    const { data: rest } = await supabase.from("pi_items").select("id, sl_no").eq("pi_id", piId).order("sl_no");
    for (const [idx, r] of ((rest ?? []) as any[]).entries()) {
      if (r.sl_no !== idx + 1) await supabase.from("pi_items").update({ sl_no: idx + 1 }).eq("id", r.id);
    }
    await recomputePiTotal(supabase, piId);
  }
}

export async function recomputePiTotal(supabase: Client, piId: string): Promise<void> {
  const [{ data: pi }, { data: items }] = await Promise.all([
    supabase.from("proforma_invoices").select("discount_type, discount_value").eq("id", piId).maybeSingle(),
    supabase.from("pi_items").select("qty_pcs, price_unit, price_basis").eq("pi_id", piId),
  ]);
  if (!pi) return;
  const subtotal = ((items ?? []) as any[]).reduce((s, it) => {
    const qty = Number(it.qty_pcs) || 0;
    const price = Number(it.price_unit) || 0;
    const raw = it.price_basis === "dzn" ? (qty / 12) * price : qty * price;
    return s + Math.round(raw * 100) / 100;
  }, 0);
  const dv = Number(pi.discount_value) || 0;
  const discount = pi.discount_type === "percentage" ? (subtotal * dv) / 100 : pi.discount_type === "fixed" ? dv : 0;
  const total = Math.round(Math.max(subtotal - discount, 0) * 100) / 100;
  await supabase.from("proforma_invoices").update({ total_amount: total }).eq("id", piId);
}
