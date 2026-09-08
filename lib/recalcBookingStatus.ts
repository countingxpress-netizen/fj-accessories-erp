import { SupabaseClient } from "@supabase/supabase-js";

export async function recalcBookingStatus(supabase: SupabaseClient, bookingId: string) {
  const { data: booking } = await supabase.from("bookings").select("quantity_pcs, status").eq("id", bookingId).single();
  if (!booking) return;

  // delivered = এই বুকিং-এর সব challan item (item.booking_id দিয়ে — এক challan-এ
  // একাধিক বুকিং থাকতে পারে, তাই challan header-এর booking_id নয়)
  const { data: items } = await supabase
    .from("delivery_challan_items").select("quantity_pcs").eq("booking_id", bookingId);
  const delivered = (items ?? []).reduce((s: number, i: any) => s + Number(i.quantity_pcs || 0), 0);

  let newStatus = booking.status;
  if (delivered <= 0) newStatus = "in_production";
  else if (delivered < booking.quantity_pcs) newStatus = "partially_delivered";
  else newStatus = "completed";

  await supabase.from("bookings").update({ status: newStatus }).eq("id", bookingId);
}