import { createClient } from "@/lib/supabase/client";

type SupabaseClient = ReturnType<typeof createClient>;

/**
 * Locked Booking (Production শুরু / Delivery Challan / PI / হাতে-বানানো Sales Invoice
 * যুক্ত) — শুধু **তারিখ** বদল। পুরো cascade rebuild নয়; নিচের রেকর্ডগুলোর তারিখ
 * নতুন তারিখে সরায়:
 *
 *   • bookings.booking_date                         (group-এর সব booking)
 *   • production_orders.order_date
 *   • RM-issue JV (bookings.inventory_voucher_id) → journal_vouchers.voucher_date
 *   • ঐ RM consumption-এর stock_ledger.txn_date + material_consumption.consumption_date
 *
 * auto Sales Invoice-এর তারিখ কলার আলাদা করে `syncAutoInvoiceForGroup({ invoiceDate })`
 * দিয়ে বসায়। অপরিবর্তিত: FG Receive / Wastage / Delivery Challan / PI / manual Sales
 * Invoice (এদের নিজস্ব ভৌত তারিখ থাকে)।
 */
export async function changeBookingGroupDate(
  supabase: SupabaseClient,
  ref: { groupId: string | null; bookingId: string },
  newDate: string,
): Promise<{ ok: boolean; error?: string }> {
  const baseQuery = supabase.from("bookings").select("id, inventory_voucher_id");
  const { data: bookings, error: bErr } = ref.groupId
    ? await baseQuery.eq("booking_group_id", ref.groupId)
    : await baseQuery.eq("id", ref.bookingId);
  if (bErr) return { ok: false, error: bErr.message };

  const bookingIds = (bookings ?? []).map((b: any) => b.id);
  if (bookingIds.length === 0) return { ok: false, error: "Booking খুঁজে পাওয়া যায়নি।" };

  await supabase.from("bookings").update({ booking_date: newDate }).in("id", bookingIds);

  const { data: pos } = await supabase
    .from("production_orders").select("id").in("booking_id", bookingIds);
  const poIds = (pos ?? []).map((p: any) => p.id);
  if (poIds.length > 0) {
    await supabase.from("production_orders").update({ order_date: newDate }).in("id", poIds);

    // RM issue-এর stock ledger (item_type='raw_material' — FG receive-এর row বাদ)
    await supabase.from("stock_ledger")
      .update({ txn_date: newDate })
      .eq("reference_type", "production")
      .eq("item_type", "raw_material")
      .in("reference_id", poIds);

    await supabase.from("material_consumption")
      .update({ consumption_date: newDate })
      .in("production_id", poIds);
  }

  const rmVoucherIds = (bookings ?? [])
    .map((b: any) => b.inventory_voucher_id)
    .filter(Boolean);
  if (rmVoucherIds.length > 0) {
    await supabase.from("journal_vouchers")
      .update({ voucher_date: newDate })
      .in("id", rmVoucherIds);
  }

  return { ok: true };
}
