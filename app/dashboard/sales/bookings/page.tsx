import React from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import BookingRow from "./BookingRow";

export default async function BookingsListPage() {
  const supabase = await createClient();
  const { data: bookings } = await supabase
    .from("bookings")
    .select("*, customers(name), buyers(name), finished_goods(product_name), production_orders(id, stage, blowing_completed_at, printing_completed_at, cutting_completed_at)")
    .order("created_at", { ascending: false });

  const { data: allChallanItems } = await supabase
    .from("delivery_challan_items")
    .select("quantity_pcs, delivery_challans(booking_id)");

  const deliveredMap: Record<string, number> = {};
  (allChallanItems ?? []).forEach((item: any) => {
    const bId = item.delivery_challans?.booking_id;
    if (!bId) return;
    deliveredMap[bId] = (deliveredMap[bId] ?? 0) + item.quantity_pcs;
  });

  const groups: { groupId: string; items: any[] }[] = [];
  const groupIndex: Record<string, number> = {};

  (bookings ?? []).forEach((b: any) => {
    const key = b.booking_group_id ?? b.id;
    if (groupIndex[key] === undefined) {
      groupIndex[key] = groups.length;
      groups.push({ groupId: key, items: [] });
    }
    groups[groupIndex[key]].items.push(b);
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Bookings</h1>
        <Link href="/dashboard/sales/bookings/new" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">
          + নতুন Booking
        </Link>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2 w-12">SL</th>
              <th className="px-4 py-2">Booking No</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Buyer</th>
              <th className="px-4 py-2">Garments</th>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2 text-right">Qty (Pcs)</th>
              <th className="px-4 py-2 text-right">Required Lbs</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group, gi) => (
              <React.Fragment key={group.groupId}>
                {group.items.map((b: any, i: number) => (
                  <BookingRow
                    key={b.id}
                    booking={b}
                    serial={i === 0 ? gi + 1 : undefined}
                    isGroupStart={i === 0}
                    groupSize={group.items.length}
                    deliveredQty={deliveredMap[b.id] ?? 0}
                  />
                ))}
              </React.Fragment>
            ))}
            {(!bookings || bookings.length === 0) && (
              <tr><td colSpan={11} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Booking নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}