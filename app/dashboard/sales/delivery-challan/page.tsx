import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ChallanTable from "./ChallanTable";
import { fetchAllRows, fetchAllRowsIn } from "@/lib/fetchAll";

export default async function DeliveryChallanListPage() {
  const supabase = await createClient();

  // ঐতিহাসিক চালান এন্ট্রি হলে হাজার ছাড়াবে — পেজ করে সব আনা
  const challans = await fetchAllRows<any>(
    supabase, "delivery_challans",
    "*, customers(name), bookings(booking_no), delivery_challan_items(id, booking_id, quantity_pcs, packets, print_label, finished_goods(product_name)), creator:app_users!delivery_challans_created_by_fkey(full_name)",
    (q) => q.order("challan_date", { ascending: false }).order("created_at", { ascending: false })
  );

  const challanList = challans ?? [];
  // প্রতি কাস্টমারের সবচেয়ে সাম্প্রতিক চালান — challan_no এখন কাস্টমার-ভিত্তিক প্লেইন
  // সিরিয়াল বলে ভিন্ন কাস্টমারের মধ্যে string তুলনা অর্থহীন; date/created_at দিয়ে
  // sorted লিস্টে প্রতি customer_id-র প্রথম occurrence-ই তার সাম্প্রতিক চালান।
  const latestChallanIdByCustomer: Record<string, string> = {};
  challanList.forEach((c: any) => {
    if (c.customer_id && !(c.customer_id in latestChallanIdByCustomer)) {
      latestChallanIdByCustomer[c.customer_id] = c.id;
    }
  });

  // PI No — প্রতিটা challan-এর item booking_id → pi_items → proforma_invoices.pi_no
  // (এক বুকিং একাধিক PI/revision-এ থাকতে পারে — সব PI No কমা দিয়ে দেখাই)
  const allBookingIds = Array.from(
    new Set(
      challanList.flatMap((c: any) =>
        (c.delivery_challan_items ?? []).map((i: any) => i.booking_id).filter(Boolean),
      ),
    ),
  );

  const piNosByBooking: Record<string, string[]> = {};
  if (allBookingIds.length) {
    const piRows = await fetchAllRowsIn<any>(supabase, "pi_items", "booking_id, proforma_invoices(pi_no)", "booking_id", allBookingIds as string[]);
    (piRows ?? []).forEach((r: any) => {
      const piNo = r.proforma_invoices?.pi_no;
      if (!r.booking_id || !piNo) return;
      const arr = (piNosByBooking[r.booking_id] ??= []);
      if (!arr.includes(piNo)) arr.push(piNo);
    });
  }

  const piNoByChallan: Record<string, string> = {};
  challanList.forEach((c: any) => {
    const nos = Array.from(
      new Set(
        (c.delivery_challan_items ?? []).flatMap((i: any) => piNosByBooking[i.booking_id] ?? []),
      ),
    );
    piNoByChallan[c.id] = nos.join(", ");
  });

  // প্রতিটা লাইনের Measurement দেখাতে — booking_id → measurement fields
  const bkById: Record<string, any> = {};
  if (allBookingIds.length) {
    const bks = await fetchAllRowsIn<any>(
      supabase, "bookings", "id, booking_no, measurement_type, measurement_unit, length_val, width_val, flap_val, gusset_val, pillow_val",
      "id", allBookingIds as string[]
    );
    (bks ?? []).forEach((b: any) => { bkById[b.id] = b; });
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Delivery Challans</h1>
        <Link
          href="/dashboard/sales/delivery-challan/new"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800 transition-colors"
        >
          + নতুন Delivery Challan
        </Link>
      </div>

      <ChallanTable challans={challanList} piNoByChallan={piNoByChallan} latestChallanIdByCustomer={latestChallanIdByCustomer} bkById={bkById} />
    </div>
  );
}
