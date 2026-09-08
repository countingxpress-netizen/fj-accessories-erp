import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ChallanTable from "./ChallanTable";

export default async function DeliveryChallanListPage() {
  const supabase = await createClient();

  const { data: challans, error } = await supabase
    .from("delivery_challans")
    .select("*, customers(name), bookings(booking_no), delivery_challan_items(id, booking_id, quantity_pcs, packets, print_label, finished_goods(product_name)), creator:app_users!delivery_challans_created_by_fkey(full_name)")
    .order("challan_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Delivery Challan Fetch Error:", error);
  }

  const challanList = challans ?? [];
  const latestChallanNo = challanList.reduce((mx: string, c: any) => (c.challan_no > mx ? c.challan_no : mx), "");

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
    const { data: piRows } = await supabase
      .from("pi_items")
      .select("booking_id, proforma_invoices(pi_no)")
      .in("booking_id", allBookingIds);
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
    const { data: bks } = await supabase
      .from("bookings")
      .select("id, booking_no, measurement_type, measurement_unit, length_val, width_val, flap_val, gusset_val, pillow_val")
      .in("id", allBookingIds);
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

      <ChallanTable challans={challanList} piNoByChallan={piNoByChallan} latestChallanNo={latestChallanNo} bkById={bkById} />
    </div>
  );
}
