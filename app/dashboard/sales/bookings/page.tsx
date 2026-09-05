import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import BookingsTable from "./BookingsTable";

export default async function BookingsListPage() {
  const supabase = await createClient();
  const { data: bookings } = await supabase
    .from("bookings")
    .select("*, customers(name), buyers(name), finished_goods(product_name), production_orders(id, stage, blowing_completed_at, printing_completed_at, cutting_completed_at), creator:app_users!bookings_created_by_fkey(full_name)")
    .order("created_at", { ascending: false });

  const { data: allChallanItems } = await supabase
    .from("delivery_challan_items")
    .select("quantity_pcs, delivery_challans(booking_id, challan_no)");

  // PI No — pi_items দিয়ে (pi_bookings টেবিল কোথাও populate হয় না, তাই সেটা ব্যবহার করা যাবে না)
  const { data: piItemRows } = await supabase
    .from("pi_items")
    .select("booking_id, proforma_invoices(pi_no)");

  const piNoByBooking: Record<string, string> = {};
  (piItemRows ?? []).forEach((item: any) => {
    if (item.booking_id && item.proforma_invoices?.pi_no) {
      piNoByBooking[item.booking_id] = item.proforma_invoices.pi_no;
    }
  });

  const deliveredMap: Record<string, number> = {};
  const challanNosByBookingSet: Record<string, Set<string>> = {};
  (allChallanItems ?? []).forEach((item: any) => {
    const bId = item.delivery_challans?.booking_id;
    if (!bId) return;
    deliveredMap[bId] = (deliveredMap[bId] ?? 0) + item.quantity_pcs;
    if (!challanNosByBookingSet[bId]) challanNosByBookingSet[bId] = new Set();
    if (item.delivery_challans?.challan_no) challanNosByBookingSet[bId].add(item.delivery_challans.challan_no);
  });
  const challanNosByBooking: Record<string, string[]> = {};
  Object.keys(challanNosByBookingSet).forEach((k) => {
    challanNosByBooking[k] = Array.from(challanNosByBookingSet[k]);
  });

  const groups: { groupId: string; items: any[] }[] = [];
  const groupIndex: Record<string, number> = {};

  (bookings ?? []).forEach((b: any) => {
    const key = b.booking_group_id ?? b.id;
    if (groupIndex[key] === undefined) {
      groupIndex[key] = groups.length;
      groups.push({ groupId: key, items: [] });
    }
    groups[groupIndex[key]].items.push(b);
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Bookings</h1>
        <Link href="/dashboard/sales/bookings/new" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">
          + নতুন Booking
        </Link>
      </div>

      <BookingsTable groups={groups} deliveredMap={deliveredMap} challanNosByBooking={challanNosByBooking} piNoByBooking={piNoByBooking} />
    </div>
  );
}
