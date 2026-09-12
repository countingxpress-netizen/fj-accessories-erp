"use client";
import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useBulkSelect } from "@/hooks/useBulkSelect";
import { BulkActionBar } from "@/components/BulkActionBar";
import { deleteBookingCascade } from "@/lib/bookingDelete";
import { useBulkDeletePermission } from "@/app/dashboard/PermissionProvider";
import ListFilterBar from "@/components/ListFilterBar";
import BookingRow from "./BookingRow";
import BookingGroupSummaryRow from "./BookingGroupSummaryRow";

export default function BookingsTable({
  groups: allGroups, deliveredMap, challanNosByBooking, piNoByBooking,
}: {
  groups: { groupId: string; items: any[] }[];
  deliveredMap: Record<string, number>;
  challanNosByBooking: Record<string, string[]>;
  piNoByBooking: Record<string, string>;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [garments, setGarments] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const allBookingsUnfiltered = useMemo(() => allGroups.flatMap((g) => g.items), [allGroups]);

  const customerOptions = useMemo(() => {
    const seen = new Map<string, string>();
    allBookingsUnfiltered.forEach((b: any) => { if (b.customer_id && b.customers?.name) seen.set(b.customer_id, b.customers.name); });
    return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [allBookingsUnfiltered]);

  const buyerOptions = useMemo(() => {
    const seen = new Map<string, string>();
    allBookingsUnfiltered.forEach((b: any) => { if (b.buyer_id && b.buyers?.name) seen.set(b.buyer_id, b.buyers.name); });
    return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [allBookingsUnfiltered]);

  const garmentsOptions = useMemo(() => {
    const set = new Set<string>();
    allBookingsUnfiltered.forEach((b: any) => { if (b.garments_name) set.add(b.garments_name); });
    return Array.from(set).sort().map((v) => ({ value: v, label: v }));
  }, [allBookingsUnfiltered]);

  function matches(b: any) {
    if (customerId && b.customer_id !== customerId) return false;
    if (buyerId && b.buyer_id !== buyerId) return false;
    if (garments && b.garments_name !== garments) return false;
    if (dateFrom && (!b.booking_date || b.booking_date < dateFrom)) return false;
    if (dateTo && (!b.booking_date || b.booking_date > dateTo)) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = `${b.booking_no ?? ""} ${b.style ?? ""} ${b.customer_booking_ref ?? ""} ${b.customers?.name ?? ""} ${b.buyers?.name ?? ""} ${b.garments_name ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  const groups = useMemo(() => {
    return allGroups
      .map((g) => ({ groupId: g.groupId, items: g.items.filter(matches) }))
      .filter((g) => g.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allGroups, search, customerId, buyerId, garments, dateFrom, dateTo]);

  function clearFilters() {
    setSearch(""); setCustomerId(""); setBuyerId(""); setGarments(""); setDateFrom(""); setDateTo("");
  }

  const allBookings = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const { partition, markFulfilled } = useBulkDeletePermission("bookings");
  const {
    selectedIds, selectedCount, isSelected, toggle, toggleMany, toggleAll, isAllSelected, isSomeSelected, clear,
  } = useBulkSelect(allBookings, (b: any) => b.id);
  const [expandedGroups, setExpandedGroups] = React.useState<Record<string, boolean>>({});
  function toggleExpand(groupId: string) {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }

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
      <ListFilterBar
        search={search} onSearchChange={setSearch} searchPlaceholder="Booking No / Style / Ref..."
        customers={customerOptions} customerId={customerId} onCustomerChange={setCustomerId}
        buyers={buyerOptions} buyerId={buyerId} onBuyerChange={setBuyerId}
        garmentsOptions={garmentsOptions} garments={garments} onGarmentsChange={setGarments}
        dateFrom={dateFrom} onDateFromChange={setDateFrom} dateTo={dateTo} onDateToChange={setDateTo}
        onClear={clearFilters}
      />
      <p className="mb-2 text-xs text-gray-400">{allBookings.length} / {allBookingsUnfiltered.length} টা Booking দেখানো হচ্ছে</p>
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
              const groupIds = group.items.map((b: any) => b.id);

              // একটাই Measurement থাকা Booking-এ Summary/Detail আলাদা করার দরকার নেই —
              // আগের মতোই একটা মাত্র সম্পূর্ণ row দেখাবে।
              if (group.items.length === 1) {
                const b = group.items[0];
                return (
                  <BookingRow
                    key={b.id}
                    booking={b}
                    serial={gi + 1}
                    groupPiNo={groupPiNo}
                    deliveredQty={deliveredMap[b.id] ?? 0}
                    challanNos={challanNosByBooking[b.id] ?? []}
                    selected={isSelected(b.id)}
                    onToggleSelect={() => toggle(b.id)}
                  />
                );
              }

              const expanded = !!expandedGroups[group.groupId];
              const allSelected = groupIds.every((id) => isSelected(id));
              const someSelected = groupIds.some((id) => isSelected(id));

              return (
                <React.Fragment key={group.groupId}>
                  <BookingGroupSummaryRow
                    items={group.items}
                    serial={gi + 1}
                    groupPiNo={groupPiNo}
                    deliveredMap={deliveredMap}
                    challanNosByBooking={challanNosByBooking}
                    expanded={expanded}
                    onToggleExpand={() => toggleExpand(group.groupId)}
                    allSelected={allSelected}
                    someSelected={someSelected}
                    onToggleSelectGroup={() => toggleMany(groupIds)}
                  />
                  {expanded && group.items.map((b: any) => (
                    <BookingRow
                      key={b.id}
                      booking={b}
                      groupPiNo={groupPiNo}
                      deliveredQty={deliveredMap[b.id] ?? 0}
                      challanNos={challanNosByBooking[b.id] ?? []}
                      selected={isSelected(b.id)}
                      onToggleSelect={() => toggle(b.id)}
                      variant="detail"
                    />
                  ))}
                </React.Fragment>
              );
            })}
            {groups.length === 0 && (
              <tr><td colSpan={13} className="px-4 py-3 text-gray-400 italic">
                {allBookingsUnfiltered.length === 0 ? "এখনো কোনো Booking নেই" : "এই ফিল্টারে কোনো Booking নেই"}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
