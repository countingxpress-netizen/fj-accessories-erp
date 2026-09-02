"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useBulkSelect } from "@/hooks/useBulkSelect";
import { BulkActionBar } from "@/components/BulkActionBar";
import { deleteInvoiceCascade } from "@/lib/invoiceDelete";
import { useBulkDeletePermission } from "@/app/dashboard/PermissionProvider";
import InvoiceRow from "./InvoiceRow";

export default function InvoicesTable({ invoices }: { invoices: any[] }) {
  const router = useRouter();
  const supabase = createClient();
  const { partition, markFulfilled } = useBulkDeletePermission("sales_invoices");

  const {
    selectedIds, selectedCount, isSelected, toggle, toggleAll, isAllSelected, isSomeSelected, clear,
  } = useBulkSelect(invoices, (inv: any) => inv.id);

  async function handleBulkDelete() {
    const { allowed, blocked } = partition(selectedIds);
    const errors: string[] = [];
    for (const id of allowed) {
      const invoice = invoices.find((inv: any) => inv.id === id);
      const result = await deleteInvoiceCascade(supabase, id, invoice?.voucher_id);
      if (!result.ok) errors.push(`${invoice?.invoice_no ?? id}: ${result.error}`);
    }
    if (blocked.length > 0) errors.push(`${blocked.length}টা Invoice-এ Delete অনুমতি নেই — নিজের Delete বাটন থেকে Request পাঠান।`);
    await markFulfilled(allowed);
    clear();
    router.refresh();
    if (errors.length > 0) {
      alert(`${errors.length}টি Invoice মুছা যায়নি:\n\n${errors.join("\n")}`);
    }
  }

  return (
    <div>
      <BulkActionBar count={selectedCount} itemLabel="Invoice" onDeleteSelected={handleBulkDelete} onClear={clear} />
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
                  aria-label="Select all invoices"
                />
              </th>
              <th className="px-4 py-2">Invoice No</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Bookings</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2 text-right">Total Amount</th>
              <th className="px-4 py-2 text-right">Commission</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv: any) => (
              <InvoiceRow key={inv.id} invoice={inv} selected={isSelected(inv.id)} onToggleSelect={() => toggle(inv.id)} />
            ))}
            {invoices.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Sales Invoice নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
