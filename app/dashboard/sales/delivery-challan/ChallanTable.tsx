"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useBulkSelect } from "@/hooks/useBulkSelect";
import { BulkActionBar } from "@/components/BulkActionBar";
import { deleteChallanCascade } from "@/lib/challanDelete";
import ChallanRow from "./ChallanRow";

export default function ChallanTable({ challans }: { challans: any[] }) {
  const router = useRouter();
  const supabase = createClient();

  const {
    selectedIds, selectedCount, isSelected, toggle, toggleAll, isAllSelected, isSomeSelected, clear,
  } = useBulkSelect(challans, (c: any) => c.id);

  async function handleBulkDelete() {
    const errors: string[] = [];
    for (const id of selectedIds) {
      const challan = challans.find((c: any) => c.id === id);
      const result = await deleteChallanCascade(supabase, id, challan?.booking_id);
      if (!result.ok) errors.push(`${challan?.challan_no ?? id}: ${result.error}`);
    }
    clear();
    router.refresh();
    if (errors.length > 0) {
      alert(`${errors.length}টি Challan মুছা যায়নি:\n\n${errors.join("\n")}`);
    }
  }

  return (
    <div>
      <BulkActionBar count={selectedCount} itemLabel="Challan" onDeleteSelected={handleBulkDelete} onClear={clear} />
      <div className="rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2 w-10">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(el) => { if (el) el.indeterminate = isSomeSelected; }}
                  onChange={toggleAll}
                  aria-label="Select all challans"
                />
              </th>
              <th className="px-4 py-2">Challan No</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Booking</th>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Delivery Status</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {challans.map((c: any) => (
              <ChallanRow key={c.id} challan={c} selected={isSelected(c.id)} onToggleSelect={() => toggle(c.id)} />
            ))}
            {challans.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-4 text-center text-gray-400 italic">
                  এখনো কোনো Delivery Challan নেই
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
