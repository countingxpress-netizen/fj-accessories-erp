"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useBulkSelect } from "@/hooks/useBulkSelect";
import { BulkActionBar } from "@/components/BulkActionBar";
import { deletePurchaseEntryCascade } from "@/lib/purchaseEntryDelete";
import { useBulkDeletePermission } from "@/app/dashboard/PermissionProvider";
import PurchaseEntryRow from "./PurchaseEntryRow";

export default function PurchaseEntriesTable({ entries }: { entries: any[] }) {
  const router = useRouter();
  const supabase = createClient();
  const { partition, markFulfilled } = useBulkDeletePermission("purchase_entries");

  const {
    selectedIds, selectedCount, isSelected, toggle, toggleAll, isAllSelected, isSomeSelected, clear,
  } = useBulkSelect(entries, (e: any) => e.id);

  async function handleBulkDelete() {
    const { allowed, blocked } = partition(selectedIds);
    const errors: string[] = [];
    for (const id of allowed) {
      const entry = entries.find((e: any) => e.id === id);
      const result = await deletePurchaseEntryCascade(supabase, id, entry?.voucher_id);
      if (!result.ok) errors.push(`${entry?.entry_no ?? id}: ${result.error}`);
    }
    if (blocked.length > 0) errors.push(`${blocked.length}টা Entry-তে Delete অনুমতি নেই — নিজের Delete বাটন থেকে Request পাঠান।`);
    await markFulfilled(allowed);
    clear();
    router.refresh();
    if (errors.length > 0) {
      alert(`${errors.length}টি Purchase Entry মুছা যায়নি:\n\n${errors.join("\n")}`);
    }
  }

  return (
    <div>
      <BulkActionBar count={selectedCount} itemLabel="Purchase Entry" onDeleteSelected={handleBulkDelete} onClear={clear} />
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2 w-10">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(el) => { if (el) el.indeterminate = isSomeSelected; }}
                  onChange={toggleAll}
                  aria-label="Select all purchase entries"
                />
              </th>
              <th className="px-4 py-2">Entry No</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Supplier</th>
              <th className="px-4 py-2">Invoice No</th>
              <th className="px-4 py-2">Payment</th>
              <th className="px-4 py-2 text-right">Total Amount</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e: any) => (
              <PurchaseEntryRow key={e.id} entry={e} selected={isSelected(e.id)} onToggleSelect={() => toggle(e.id)} />
            ))}
            {entries.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Purchase Entry নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
