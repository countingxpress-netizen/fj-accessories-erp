import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProformaRow from "./ProformaRow";

export default async function ProformaListPage() {
  const supabase = await createClient();
  const { data: pis } = await supabase
    .from("proforma_invoices")
    .select("*, customers(name, price_per_lbs), pi_items(qty_pcs, bookings(quantity_pcs, measurement_type, measurement_unit, length_val, width_val, flap_val, gusset_val, pi_thickness_mm, finished_goods(length_cm, width_cm, thickness)))")
    .order("pi_date", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Proforma Invoices</h1>
        <Link href="/dashboard/lc-export/proforma/new" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">+ নতুন PI</Link>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">PI No</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2 text-right">Booking Value</th>
              <th className="px-4 py-2 text-right">PI Value</th>
              <th className="px-4 py-2 text-right">Difference</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(pis ?? []).map((pi: any) => (
              <ProformaRow key={pi.id} pi={pi} customerPricePerLbs={pi.customers?.price_per_lbs ?? null} />
            ))}
            {(!pis || pis.length === 0) && (
              <tr><td colSpan={8} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Proforma Invoice নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}