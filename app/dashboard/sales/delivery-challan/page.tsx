import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ChallanRow from "./ChallanRow";

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

      <div className="rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Challan No</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Booking</th>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Delivery Status</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {challanList.map((c: any) => (
              <ChallanRow key={c.id} challan={c} />
            ))}
            {challanList.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-4 text-center text-gray-400 italic">
                  এখনো কোনো Delivery Challan নেই
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}