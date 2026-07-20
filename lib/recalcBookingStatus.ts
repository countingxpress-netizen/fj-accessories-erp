import { SupabaseClient } from "@supabase/supabase-js";

export async function recalcBookingStatus(supabase: SupabaseClient, bookingId: string) {
  const { data: booking } = await supabase.from("bookings").select("quantity_pcs, status").eq("id", bookingId).single();
  if (!booking) return;

  const { data: challans } = await supabase.from("delivery_challans").select("id").eq("booking_id", bookingId);
  const challanIds = (challans ?? []).map((c: any) => c.id);

  let delivered = 0;
  if (challanIds.length) {
    const { data: items } = await supabase.from("delivery_challan_items").select("quantity_pcs").in("challan_id", challanIds);
    delivered = (items ?? []).reduce((s: number, i: any) => s + i.quantity_pcs, 0);
  }

  let newStatus = booking.status;
  if (delivered <= 0) newStatus = "in_production";
  else if (delivered < booking.quantity_pcs) newStatus = "partially_delivered";
  else newStatus = "completed";

  await supabase.from("bookings").update({ status: newStatus }).eq("id", bookingId);
}