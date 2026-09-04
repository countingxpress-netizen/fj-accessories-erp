"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useBulkSelect } from "@/hooks/useBulkSelect";
import { BulkActionBar } from "@/components/BulkActionBar";
import { deleteSimpleRow } from "@/lib/simpleDelete";
import { syncCustomerOpeningJv } from "@/lib/customerOpeningJv";
import { useBulkDeletePermission } from "@/app/dashboard/PermissionProvider";
import CustomerRow from "./CustomerRow";

export default function CustomersTable({ customers }: { customers: any[] }) {
  const router = useRouter();
  const supabase = createClient();
  const { partition, markFulfilled } = useBulkDeletePermission("customers");

  const {
    selectedIds, selectedCount, isSelected, toggle, toggleAll, isAllSelected, isSomeSelected, clear,
  } = useBulkSelect(customers, (c: any) => c.id);

  async function handleBulkDelete() {
    const { allowed, blocked } = partition(selectedIds);
    const errors: string[] = [];
    for (const id of allowed) {
      const customer = customers.find((c: any) => c.id === id);
      const result = await deleteSimpleRow(supabase, "customers", id);
      if (!result.ok) errors.push(`${customer?.name ?? id}: ${result.error}`);
    }
    if (blocked.length > 0) errors.push(`${blocked.length}টা Customer-এ Delete অনুমতি নেই — নিজের Delete বাটন থেকে Request পাঠান।`);
    await markFulfilled(allowed);
    if (allowed.length > 0) await syncCustomerOpeningJv(supabase);
    clear();
    router.refresh();
    if (errors.length > 0) {
      alert(`${errors.length}টি Customer মুছা যায়নি:\n\n${errors.join("\n")}`);
    }
  }

  return (
    <div>
      <BulkActionBar count={selectedCount} itemLabel="Customer" onDeleteSelected={handleBulkDelete} onClear={clear} />
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
                  aria-label="Select all customers"
                />
              </th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Address</th>
              <th className="px-4 py-2">Phone</th>
              <th className="px-4 py-2">Price/Lbs</th>
              <th className="px-4 py-2">Print Rate</th>
              <th className="px-4 py-2">Adhesive Rate</th>
              <th className="px-4 py-2 text-right">Opening Balance</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c: any) => (
              <CustomerRow key={c.id} customer={c} selected={isSelected(c.id)} onToggleSelect={() => toggle(c.id)} />
            ))}
            {customers.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-3 text-gray-400 italic">কোনো Customer যোগ করা হয়নি</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
