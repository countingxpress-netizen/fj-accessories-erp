import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";

const stageLabels: Record<string, string> = {
  blowing: "Blowing",
  printing: "Printing",
  cutting: "Cutting",
  finished: "Finished",
};
const stageColors: Record<string, string> = {
  blowing: "bg-blue-100 text-blue-700",
  printing: "bg-purple-100 text-purple-700",
  cutting: "bg-orange-100 text-orange-700",
  finished: "bg-green-100 text-green-700",
};

export default async function ProductionOrdersPage() {
  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("production_orders")
    .select("*, bookings(booking_no, customers(name), finished_goods(product_name))")
    .order("order_date", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Production Orders</h1>
        <Link href="/dashboard/production/orders/new" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">
          + নতুন Production Order
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Production No</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Booking</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2 text-right">Qty (Pcs)</th>
              <th className="px-4 py-2 text-right">Required Lbs</th>
              <th className="px-4 py-2">Stage</th>
            </tr>
          </thead>
          <tbody>
            {(orders ?? []).map((o: any) => (
              <tr key={o.id} className="border-t">
                <td className="px-4 py-2 font-medium">{o.production_no}</td>
                <td className="px-4 py-2 text-gray-500">{o.order_date}</td>
                <td className="px-4 py-2">{o.bookings?.booking_no ?? "-"}</td>
                <td className="px-4 py-2">{o.bookings?.customers?.name ?? "-"}</td>
                <td className="px-4 py-2">{o.bookings?.finished_goods?.product_name ?? "-"}</td>
                <td className="px-4 py-2 text-right">{o.quantity_pcs?.toLocaleString()}</td>
                <td className="px-4 py-2 text-right">{o.required_lbs?.toFixed(2)}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${stageColors[o.stage] ?? ""}`}>
                    {stageLabels[o.stage] ?? o.stage}
                  </span>
                </td>
              </tr>
            ))}
            {(!orders || orders.length === 0) && (
              <tr><td colSpan={8} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Production Order নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}