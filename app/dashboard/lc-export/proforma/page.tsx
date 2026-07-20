import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProformaRow from "./ProformaRow";

export default async function ProformaListPage() {
  const supabase = await createClient();
  const { data: pis } = await supabase
    .from("proforma_invoices")
    .select("*, customers(name), pi_bookings(bookings(booking_no))")
    .order("pi_date", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Proforma Invoices</h1>
        <Link href="/dashboard/lc-export/proforma/new" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">+ নতুন PI</Link>
      </div>
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">PI No</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Bookings</th>
              <th className="px-4 py-2 text-right">Total Amount</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(pis ?? []).map((pi) => <ProformaRow key={pi.id} pi={pi} />)}
            {(!pis || pis.length === 0) && (
              <tr><td colSpan={6} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Proforma Invoice নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}