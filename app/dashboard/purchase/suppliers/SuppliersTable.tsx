"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useBulkSelect } from "@/hooks/useBulkSelect";
import { BulkActionBar } from "@/components/BulkActionBar";
import { deleteSimpleRow } from "@/lib/simpleDelete";
import SupplierRow from "./SupplierRow";

export default function SuppliersTable({ suppliers }: { suppliers: any[] }) {
  const router = useRouter();
  const supabase = createClient();

  const {
    selectedIds, selectedCount, isSelected, toggle, toggleAll, isAllSelected, isSomeSelected, clear,
  } = useBulkSelect(suppliers, (s: any) => s.id);

  async function handleBulkDelete() {
    const errors: string[] = [];
    for (const id of selectedIds) {
      const supplier = suppliers.find((s: any) => s.id === id);
      const result = await deleteSimpleRow(supabase, "suppliers", id);
      if (!result.ok) errors.push(`${supplier?.name ?? id}: ${result.error}`);
    }
    clear();
    router.refresh();
    if (errors.length > 0) {
      alert(`${errors.length}টি Supplier মুছা যায়নি:\n\n${errors.join("\n")}`);
    }
  }

  return (
    <div>
      <BulkActionBar count={selectedCount} itemLabel="Supplier" onDeleteSelected={handleBulkDelete} onClear={clear} />
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
                  aria-label="Select all suppliers"
                />
              </th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Address</th>
              <th className="px-4 py-2">Phone</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s: any) => (
              <SupplierRow key={s.id} supplier={s} selected={isSelected(s.id)} onToggleSelect={() => toggle(s.id)} />
            ))}
            {suppliers.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-3 text-gray-400 italic">কোনো Supplier যোগ করা হয়নি</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
