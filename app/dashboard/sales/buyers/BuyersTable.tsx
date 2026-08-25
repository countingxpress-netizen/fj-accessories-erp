"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useBulkSelect } from "@/hooks/useBulkSelect";
import { BulkActionBar } from "@/components/BulkActionBar";
import { deleteSimpleRow } from "@/lib/simpleDelete";
import BuyerRow from "./BuyerRow";

export default function BuyersTable({
  groups,
}: { groups: { customerName: string; items: any[] }[] }) {
  const router = useRouter();
  const supabase = createClient();

  const allBuyers = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const {
    selectedIds, selectedCount, isSelected, toggle, toggleMany, clear,
  } = useBulkSelect(allBuyers, (b: any) => b.id);

  async function handleBulkDelete() {
    const errors: string[] = [];
    for (const id of selectedIds) {
      const buyer = allBuyers.find((b: any) => b.id === id);
      const result = await deleteSimpleRow(supabase, "buyers", id);
      if (!result.ok) errors.push(`${buyer?.name ?? id}: ${result.error}`);
    }
    clear();
    router.refresh();
    if (errors.length > 0) {
      alert(`${errors.length}টি Buyer মুছা যায়নি:\n\n${errors.join("\n")}`);
    }
  }

  return (
    <div>
      <BulkActionBar count={selectedCount} itemLabel="Buyer" onDeleteSelected={handleBulkDelete} onClear={clear} />
      {groups.map((group, gi) => {
        const groupIds = group.items.map((b: any) => b.id);
        const allSel = groupIds.length > 0 && groupIds.every(isSelected);
        const someSel = groupIds.some(isSelected) && !allSel;
        return (
          <div key={gi} className="mb-6">
            <h2 className="text-sm font-semibold uppercase text-gray-500 mb-2">{group.customerName}</h2>
            <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
              <table className="w-full text-sm">
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
      {groups.length === 0 && (
        <p className="text-gray-400 italic text-sm">কোনো Buyer যোগ করা হয়নি</p>
      )}
    </div>
  );
}
