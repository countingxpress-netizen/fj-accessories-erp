import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ReceiveForm from "./ReceiveForm";

export default async function FinishedGoodsReceivePage() {
  const supabase = await createClient();

  // যেসব production order এখনো "finished" হয়নি
  const { data: orders } = await supabase
    .from("production_orders")
    .select("id, production_no, quantity_pcs, bookings(customers(name), finished_goods(id, product_name))")
    .neq("stage", "finished")
    .order("order_date", { ascending: false });

  const { data: warehouses } = await supabase.from("warehouses").select("id, name").order("name");

  const { data: receives } = await supabase
    .from("finished_goods_receive")
    .select("*, finished_goods(product_name), production_orders(production_no)")
    .order("received_date", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Finished Goods Receive</h1>
        <Link href="/dashboard/production" className="text-sm text-gray-500 hover:underline">← Production-এ ফিরুন</Link>
      </div>

      <ReceiveForm orders={(orders ?? []) as any} warehouses={warehouses ?? []} />

      <div className="mt-6 overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Production No</th>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2 text-right">Quantity (Pcs)</th>
            </tr>
          </thead>
          <tbody>
            {(receives ?? []).map((r: any) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2 text-gray-500">{r.received_date}</td>
                <td className="px-4 py-2">{r.production_orders?.production_no ?? "-"}</td>
                <td className="px-4 py-2">{r.finished_goods?.product_name ?? "-"}</td>
                <td className="px-4 py-2 text-right">{r.quantity_pcs?.toLocaleString("en-IN")}</td>
              </tr>
            ))}
            {(!receives || receives.length === 0) && (
              <tr><td colSpan={4} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Receive এন্ট্রি নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}