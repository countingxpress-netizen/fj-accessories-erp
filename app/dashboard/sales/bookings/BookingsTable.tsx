"use client";
import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useBulkSelect } from "@/hooks/useBulkSelect";
import { BulkActionBar } from "@/components/BulkActionBar";
import { deleteBookingCascade } from "@/lib/bookingDelete";
import { useBulkDeletePermission } from "@/app/dashboard/PermissionProvider";
import BookingRow from "./BookingRow";

export default function BookingsTable({
  groups, deliveredMap, challanNosByBooking, piNoByBooking,
}: {
  groups: { groupId: string; items: any[] }[];
  deliveredMap: Record<string, number>;
  challanNosByBooking: Record<string, string[]>;
  piNoByBooking: Record<string, string>;
}) {
  const router = useRouter();
  const supabase = createClient();

  const allBookings = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const { partition, markFulfilled } = useBulkDeletePermission("bookings");
  const {
    selectedIds, selectedCount, isSelected, toggle, toggleAll, isAllSelected, isSomeSelected, clear,
  } = useBulkSelect(allBookings, (b: any) => b.id);

  async function handleBulkDelete() {
    const { allowed, blocked } = partition(selectedIds);
    const errors: string[] = [];
    for (const id of allowed) {
      const result = await deleteBookingCascade(supabase, id);
      if (!result.ok) {
        const booking = allBookings.find((b: any) => b.id === id);
        errors.push(`${booking?.booking_no ?? id}: ${result.error}`);
      }
    }
    if (blocked.length > 0) errors.push(`${blocked.length}টা বুকিং-এ Delete অনুমতি নেই — নিজের Delete বাটন থেকে Request পাঠান।`);
    await markFulfilled(allowed);
    clear();
    router.refresh();
    if (errors.length > 0) {
      alert(`${errors.length}টি বুকিং মুছা যায়নি:\n\n${errors.join("\n")}`);
    }
  }

  return (
    <div>
      <BulkActionBar count={selectedCount} itemLabel="বুকিং" onDeleteSelected={handleBulkDelete} onClear={clear} />
      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2 w-10">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(el) => { if (el) el.indeterminate = isSomeSelected; }}
                  onChange={toggleAll}
                  aria-label="Select all bookings"
                />
              </th>
              <th className="px-4 py-2 w-12">SL</th>
              <th className="px-4 py-2">Booking No</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Buyer</th>
              <th className="px-4 py-2">Garments</th>
              <th className="px-4 py-2">Measurement</th>
              <th className="px-4 py-2 text-right">Qty (Pcs)</th>
              <th className="px-4 py-2 text-right">Required Lbs</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">PI No</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group, gi) => {
              const groupPiNos = Array.from(
                new Set(group.items.map((b: any) => piNoByBooking[b.id]).filter(Boolean))
              );
              const groupPiNo = groupPiNos.join(", ");
              return (
                <React.Fragment key={group.groupId}>
                  {group.items.map((b: any, i: number) => (
                    <BookingRow
                      key={b.id}
                      booking={b}
                      serial={i === 0 ? gi + 1 : undefined}
                      isGroupStart={i === 0}
                      groupSize={group.items.length}
                      groupPiNo={groupPiNo}
                      deliveredQty={deliveredMap[b.id] ?? 0}
                      challanNos={challanNosByBooking[b.id] ?? []}
                      selected={isSelected(b.id)}
                      onToggleSelect={() => toggle(b.id)}
                    />
                  ))}
                </React.Fragment>
              );
            })}
            {groups.length === 0 && (
              <tr><td colSpan={13} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Booking নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
