"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useBulkSelect } from "@/hooks/useBulkSelect";
import { BulkActionBar } from "@/components/BulkActionBar";
import { deleteSimpleRow } from "@/lib/simpleDelete";
import GarmentRow from "./GarmentRow";

export default function GarmentsTable({
  groups,
}: { groups: { customerName: string; items: any[] }[] }) {
  const router = useRouter();
  const supabase = createClient();

  const allGarments = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const {
    selectedIds, selectedCount, isSelected, toggle, toggleMany, clear,
  } = useBulkSelect(allGarments, (g: any) => g.id);

  async function handleBulkDelete() {
    const errors: string[] = [];
    for (const id of selectedIds) {
      const garment = allGarments.find((g: any) => g.id === id);
      const result = await deleteSimpleRow(supabase, "garments", id);
      if (!result.ok) errors.push(`${garment?.name ?? id}: ${result.error}`);
    }
    clear();
    router.refresh();
    if (errors.length > 0) {
      alert(`${errors.length}টি Garment মুছা যায়নি:\n\n${errors.join("\n")}`);
    }
  }

  return (
    <div>
      <BulkActionBar count={selectedCount} itemLabel="Garment" onDeleteSelected={handleBulkDelete} onClear={clear} />
      {groups.map((group, gi) => {
        const groupIds = group.items.map((g: any) => g.id);
        const allSel = groupIds.length > 0 && groupIds.every(isSelected);
        const someSel = groupIds.some(isSelected) && !allSel;
        return (
          <div key={gi} className="mb-6">
            <h2 className="text-sm font-semibold uppercase text-gray-500 mb-2">{group.customerName}</h2>
            <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allSel}
                        ref={(el) => { if (el) el.indeterminate = someSel; }}
                        onChange={() => toggleMany(groupIds)}
                        aria-label={`Select all garments for ${group.customerName}`}
                      />
                    </th>
                    <th className="px-4 py-3">Garment Name</th>
                    <th className="px-4 py-3">Address</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((g: any) => (
                    <GarmentRow key={g.id} garment={g} selected={isSelected(g.id)} onToggleSelect={() => toggle(g.id)} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {groups.length === 0 && (
        <p className="text-gray-400 italic text-sm">কোনো Garments যোগ করা হয়নি</p>
      )}
    </div>
  );
}
