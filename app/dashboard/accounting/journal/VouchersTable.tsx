"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useBulkSelect } from "@/hooks/useBulkSelect";
import { BulkActionBar } from "@/components/BulkActionBar";
import { deleteSimpleRow } from "@/lib/simpleDelete";
import { useBulkDeletePermission } from "@/app/dashboard/PermissionProvider";
import VoucherRow from "./VoucherRow";

export default function VouchersTable({ vouchers }: { vouchers: any[] }) {
  const router = useRouter();
  const supabase = createClient();
  const { partition, markFulfilled } = useBulkDeletePermission("journal_vouchers");

  const {
    selectedIds, selectedCount, isSelected, toggle, toggleAll, isAllSelected, isSomeSelected, clear,
  } = useBulkSelect(vouchers, (v: any) => v.id);

  async function handleBulkDelete() {
    const { allowed, blocked } = partition(selectedIds);
    const errors: string[] = [];
    for (const id of allowed) {
      const voucher = vouchers.find((v: any) => v.id === id);
      const result = await deleteSimpleRow(supabase, "journal_vouchers", id);
      if (!result.ok) errors.push(`${voucher?.voucher_no ?? id}: ${result.error}`);
    }
    if (blocked.length > 0) errors.push(`${blocked.length}টা Voucher-এ Delete অনুমতি নেই — নিজের Delete বাটন থেকে Request পাঠান।`);
    await markFulfilled(allowed);
    clear();
    router.refresh();
    if (errors.length > 0) {
      alert(`${errors.length}টি Voucher মুছা যায়নি:\n\n${errors.join("\n")}`);
    }
  }

  return (
    <div>
      <BulkActionBar count={selectedCount} itemLabel="Voucher" onDeleteSelected={handleBulkDelete} onClear={clear} />
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
                  aria-label="Select all vouchers"
                />
              </th>
              <th className="px-4 py-2">Voucher No</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Narration</th>
              <th className="px-4 py-2 text-right">Amount</th>
              <th className="px-4 py-2">Created By</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map((v: any) => (
              <VoucherRow key={v.id} voucher={v} selected={isSelected(v.id)} onToggleSelect={() => toggle(v.id)} />
            ))}
            {vouchers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-3 text-gray-400 italic">
                  এখনো কোনো Journal Voucher তৈরি হয়নি
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
