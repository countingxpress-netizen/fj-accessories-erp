"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useBulkSelect } from "@/hooks/useBulkSelect";
import { BulkActionBar } from "@/components/BulkActionBar";
import { deleteSimpleRow } from "@/lib/simpleDelete";
import { useBulkDeletePermission } from "@/app/dashboard/PermissionProvider";
import ListFilterBar from "@/components/ListFilterBar";
import BuyerRow from "./BuyerRow";

type Group = { customerId: string; customerName: string; items: any[] };

export default function BuyersTable({
  groups: allGroups,
}: { groups: Group[] }) {
  const router = useRouter();
  const supabase = createClient();
  const { partition, markFulfilled } = useBulkDeletePermission("buyers");

  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [buyerId, setBuyerId] = useState("");

  const customerOptions = useMemo(
    () => allGroups.map((g) => ({ value: g.customerId, label: g.customerName })).sort((a, b) => a.label.localeCompare(b.label)),
    [allGroups]
  );

  // Customer সিলেক্ট থাকলে Buyer ড্রপডাউন শুধু সেই কাস্টমারের বায়ারগুলোই দেখাবে।
  const buyerOptions = useMemo(() => {
    const scoped = customerId ? allGroups.filter((g) => g.customerId === customerId) : allGroups;
    return scoped
      .flatMap((g) => g.items)
      .map((b: any) => ({ value: b.id, label: b.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allGroups, customerId]);

  function handleCustomerChange(v: string) {
    setCustomerId(v);
    setBuyerId("");
  }

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allGroups
      .filter((g) => !customerId || g.customerId === customerId)
      .map((g) => ({
        ...g,
        items: g.items.filter((b: any) => {
          if (buyerId && b.id !== buyerId) return false;
          if (q && !(b.name ?? "").toLowerCase().includes(q)) return false;
          return true;
        }),
      }))
      .filter((g) => g.items.length > 0);
  }, [allGroups, search, customerId, buyerId]);

  function clearFilters() {
    setSearch(""); setCustomerId(""); setBuyerId("");
  }

  const allBuyers = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const {
    selectedIds, selectedCount, isSelected, toggle, toggleMany, clear,
  } = useBulkSelect(allBuyers, (b: any) => b.id);

  async function handleBulkDelete() {
    const { allowed, blocked } = partition(selectedIds);
    const errors: string[] = [];
    for (const id of allowed) {
      const buyer = allBuyers.find((b: any) => b.id === id);
      const result = await deleteSimpleRow(supabase, "buyers", id);
      if (!result.ok) errors.push(`${buyer?.name ?? id}: ${result.error}`);
    }
    if (blocked.length > 0) errors.push(`${blocked.length}টা Buyer-এ Delete অনুমতি নেই — নিজের Delete বাটন থেকে Request পাঠান।`);
    await markFulfilled(allowed);
    clear();
    router.refresh();
    if (errors.length > 0) {
      alert(`${errors.length}টি Buyer মুছা যায়নি:\n\n${errors.join("\n")}`);
    }
  }

  return (
    <div>
      <ListFilterBar
        search={search} onSearchChange={setSearch} searchPlaceholder="Buyer নাম..."
        customers={customerOptions} customerId={customerId} onCustomerChange={handleCustomerChange}
        buyers={buyerOptions} buyerId={buyerId} onBuyerChange={setBuyerId}
        onClear={clearFilters}
      />
      <BulkActionBar count={selectedCount} itemLabel="Buyer" onDeleteSelected={handleBulkDelete} onClear={clear} />
      {groups.length === 0 && (
        <p className="text-gray-400 italic text-sm">এই ফিল্টারে কোনো Buyer নেই</p>
      )}
      {groups.map((group, gi) => {
        const groupIds = group.items.map((b: any) => b.id);
        const allSel = groupIds.length > 0 && groupIds.every(isSelected);
        const someSel = groupIds.some(isSelected) && !allSel;
        return (
          <div key={gi} className="mb-6">
            <h2 className="text-sm font-semibold uppercase text-gray-500 mb-2">{group.customerName}</h2>
            <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
              <table className="w-full text-sm min-w-[1400px]">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-4 py-2 w-10">
                      <input
                        type="checkbox"
                        checked={allSel}
                        ref={(el) => { if (el) el.indeterminate = someSel; }}
                        onChange={() => toggleMany(groupIds)}
                        aria-label={`Select all buyers for ${group.customerName}`}
                      />
                    </th>
                    <th className="px-4 py-2">Buyer</th>
                    <th className="px-4 py-2">PI Pricing Rule Value</th>
                    <th className="px-4 py-2">PI Thickness (mm)</th>
                    <th className="px-4 py-2">Booking Thickness (mm)</th>
                    <th className="px-4 py-2">Production Thickness (mm)</th>
                    <th className="px-4 py-2">Adhesive Rate/Inch</th>
                    <th className="px-4 py-2">Print/Color/Pc</th>
                    <th className="px-4 py-2">Color Quantity</th>
                    <th className="px-4 py-2">AT Markup %</th>
                    <th className="px-4 py-2">USD→BDT Rate</th>
                    <th className="px-4 py-2">USD Surcharge/Pc</th>
                    <th className="px-4 py-2">Default Basis</th>
                    <th className="px-4 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((b: any) => (
                    <BuyerRow key={b.id} buyer={b} selected={isSelected(b.id)} onToggleSelect={() => toggle(b.id)} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {allGroups.length === 0 && (
        <p className="text-gray-400 italic text-sm">কোনো Buyer যোগ করা হয়নি</p>
      )}
    </div>
  );
}
