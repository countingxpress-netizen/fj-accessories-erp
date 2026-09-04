import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import WastageForm from "./WastageForm";
import WastageRow from "./WastageRow";
import { money } from "@/lib/format";

const stageLabels: Record<string, string> = { blowing: "Blowing", printing: "Printing", cutting: "Cutting" };

export default async function WastagePage() {
  const supabase = await createClient();

  const { data: orders } = await supabase
    .from("production_orders")
    .select("id, production_no, stage, bookings(booking_no, required_lbs, customers(name))")
    .order("order_date", { ascending: false });

  const { data: warehouses } = await supabase.from("warehouses").select("id, name").order("name");

  const { data: wastageEntries } = await supabase
    .from("wastage")
    .select("*, production_orders(production_no, bookings(booking_no, customers(name))), creator:app_users!wastage_created_by_fkey(full_name)")
    .order("wastage_date", { ascending: false });

  const totalByStage: Record<string, number> = { blowing: 0, printing: 0, cutting: 0 };
  let totalRecycled = 0;
  (wastageEntries ?? []).forEach((w: any) => {
    totalByStage[w.stage] = (totalByStage[w.stage] ?? 0) + w.quantity_lbs;
    if (w.recycled) totalRecycled += w.quantity_lbs;
  });
  const grandTotal = totalByStage.blowing + totalByStage.printing + totalByStage.cutting;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Wastage</h1>
        <Link href="/dashboard/production" className="text-sm text-gray-500 hover:underline">← Production-এ ফিরুন</Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Blowing</p>
          <p className="text-lg font-semibold">{money(totalByStage.blowing)} Lbs</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Printing</p>
          <p className="text-lg font-semibold">{money(totalByStage.printing)} Lbs</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Cutting</p>
          <p className="text-lg font-semibold">{money(totalByStage.cutting)} Lbs</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Total Wastage</p>
          <p className="text-lg font-semibold">{money(grandTotal)} Lbs</p>
          <p className="text-xs text-green-600">{money(totalRecycled)} Lbs রিসাইকেল হয়েছে</p>
        </div>
      </div>

      <WastageForm orders={(orders ?? []) as any} warehouses={warehouses ?? []} />

      <div className="mt-6 overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Production No</th>
              <th className="px-4 py-2">Customer / Booking</th>
              <th className="px-4 py-2">Stage</th>
              <th className="px-4 py-2 text-right">Quantity (Lbs)</th>
              <th className="px-4 py-2">Recycled?</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(wastageEntries ?? []).map((w: any) => (
              <WastageRow key={w.id} wastage={w} warehouses={warehouses ?? []} />
            ))}
            {(!wastageEntries || wastageEntries.length === 0) && (
              <tr><td colSpan={7} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Wastage এন্ট্রি নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}