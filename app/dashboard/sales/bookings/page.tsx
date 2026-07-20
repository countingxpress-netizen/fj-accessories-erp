import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import BookingRow from "./BookingRow";

export default async function BookingsListPage() {
  const supabase = await createClient();
  const { data: bookings } = await supabase
    .from("bookings")
    .select("*, customers(name), buyers(name), finished_goods(product_name)")
    .order("booking_date", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Bookings</h1>
        <Link href="/dashboard/sales/bookings/new" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">
          + নতুন Booking
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Booking No</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Buyer</th>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2 text-right">Qty (Pcs)</th>
              <th className="px-4 py-2 text-right">Required Lbs</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(bookings ?? []).map((b: any) => <BookingRow key={b.id} booking={b} />)}
            {(!bookings || bookings.length === 0) && (
              <tr><td colSpan={9} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Booking নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}