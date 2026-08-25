import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ChallanTable from "./ChallanTable";

export default async function DeliveryChallanListPage() {
  const supabase = await createClient();

  const { data: challans, error } = await supabase
    .from("delivery_challans")
    .select("*, customers(name), bookings(booking_no), delivery_challan_items(quantity_pcs, finished_goods(product_name))")
    .order("challan_date", { ascending: false });

  if (error) {
    console.error("Delivery Challan Fetch Error:", error);
  }

  const challanList = challans ?? [];

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

      <ChallanTable challans={challanList} />
    </div>
  );
}
