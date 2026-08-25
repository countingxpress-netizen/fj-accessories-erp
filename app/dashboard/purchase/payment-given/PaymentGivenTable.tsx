"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useBulkSelect } from "@/hooks/useBulkSelect";
import { BulkActionBar } from "@/components/BulkActionBar";
import { deleteSupplierPaymentCascade } from "@/lib/paymentGivenDelete";
import PaymentGivenRow from "./PaymentGivenRow";

export default function PaymentGivenTable({ payments }: { payments: any[] }) {
  const router = useRouter();
  const supabase = createClient();

  const {
    selectedIds, selectedCount, isSelected, toggle, toggleAll, isAllSelected, isSomeSelected, clear,
  } = useBulkSelect(payments, (p: any) => p.id);

  async function handleBulkDelete() {
    const errors: string[] = [];
    for (const id of selectedIds) {
      const payment = payments.find((p: any) => p.id === id);
      const result = await deleteSupplierPaymentCascade(supabase, id, payment?.voucher_id);
      if (!result.ok) errors.push(`${payment?.suppliers?.name ?? id}: ${result.error}`);
    }
    clear();
    router.refresh();
    if (errors.length > 0) {
      alert(`${errors.length}টি Payment মুছা যায়নি:\n\n${errors.join("\n")}`);
    }
  }

  return (
    <div className="mt-6">
      <BulkActionBar count={selectedCount} itemLabel="Payment" onDeleteSelected={handleBulkDelete} onClear={clear} />
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
                  aria-label="Select all payments"
                />
              </th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Supplier</th>
              <th className="px-4 py-2">Note</th>
              <th className="px-4 py-2 text-right">Amount</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p: any) => (
              <PaymentGivenRow key={p.id} payment={p} selected={isSelected(p.id)} onToggleSelect={() => toggle(p.id)} />
            ))}
            {payments.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Payment নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
