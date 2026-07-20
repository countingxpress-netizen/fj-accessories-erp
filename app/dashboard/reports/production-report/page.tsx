import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";

export default async function ProductionReportPage({
  searchParams,
}: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { from, to } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("production_orders")
    .select("*, bookings(booking_no, customers(name), finished_goods(product_name)), material_consumption(quantity_lbs, raw_materials(material_name)), wastage(quantity_lbs, stage, recycled)")
    .order("order_date", { ascending: false });

  if (from) query = query.gte("order_date", from);
  if (to) query = query.lte("order_date", to);

  const { data: orders } = await query;

  const totalConsumption = (orders ?? []).reduce(
    (s: number, o: any) => s + (o.material_consumption ?? []).reduce((s2: number, m: any) => s2 + m.quantity_lbs, 0), 0
  );
  const totalWastage = (orders ?? []).reduce(
    (s: number, o: any) => s + (o.wastage ?? []).reduce((s2: number, w: any) => s2 + w.quantity_lbs, 0), 0
  );
  const wastagePercent = totalConsumption > 0 ? (totalWastage / totalConsumption) * 100 : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Production Report</h1>
        <Link href="/dashboard/reports" className="text-sm text-gray-500 hover:underline">← Reports-এ ফিরুন</Link>
      </div>

      <form className="mb-4 flex items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" name="from" defaultValue={from} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" name="to" defaultValue={to} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">ফিল্টার করুন</button>
      </form>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Total Material Consumption</p>
          <p className="text-lg font-semibold">{totalConsumption.toFixed(2)} Lbs</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Total Wastage</p>
          <p className="text-lg font-semibold">{totalWastage.toFixed(2)} Lbs</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Wastage %</p>
          <p className="text-lg font-semibold">{wastagePercent.toFixed(2)}%</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Production No</th>
              <th className="px-4 py-2">Customer / Product</th>
              <th className="px-4 py-2 text-right">Qty (Pcs)</th>
              <th className="px-4 py-2 text-right">Consumption</th>
              <th className="px-4 py-2 text-right">Wastage</th>
              <th className="px-4 py-2">Stage</th>
            </tr>
          </thead>
          <tbody>
            {(orders ?? []).map((o: any) => {
              const consumption = (o.material_consumption ?? []).reduce((s: number, m: any) => s + m.quantity_lbs, 0);
              const wastage = (o.wastage ?? []).reduce((s: number, w: any) => s + w.quantity_lbs, 0);
              return (
                <tr key={o.id} className="border-t">
                  <td className="px-4 py-2 text-gray-500">{formatDate(o.order_date)}</td>
                  <td className="px-4 py-2 font-medium">{o.production_no}</td>
                  <td className="px-4 py-2">{o.bookings?.customers?.name} / {o.bookings?.finished_goods?.product_name}</td>
                  <td className="px-4 py-2 text-right">{o.quantity_pcs}</td>
                  <td className="px-4 py-2 text-right">{consumption.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right">{wastage.toFixed(2)}</td>
                  <td className="px-4 py-2 capitalize">{o.stage}</td>
                </tr>
              );
            })}
            {(!orders || orders.length === 0) && (
              <tr><td colSpan={7} className="px-4 py-3 text-gray-400 italic">এই সময়সীমায় কোনো Production Order নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}