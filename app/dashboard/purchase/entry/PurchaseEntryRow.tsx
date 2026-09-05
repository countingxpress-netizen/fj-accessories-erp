"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deletePurchaseEntryCascade } from "@/lib/purchaseEntryDelete";
import GuardedAction from "@/app/dashboard/GuardedAction";
import { money } from "@/lib/format";

export default function PurchaseEntryRow({
  entry, selected, onToggleSelect,
}: { entry: any; selected?: boolean; onToggleSelect?: () => void }) {
  const router = useRouter();
  const supabase = createClient();

  const total = (entry.purchase_entry_items ?? []).reduce(
    (sum: number, i: any) => sum + i.quantity_lbs * i.rate_per_lbs, 0
  );

  async function handleDelete() {
    if (!window.confirm(`Purchase Entry "${entry.entry_no ?? entry.id}" মুছে ফেলতে চান? স্টকে যোগ হওয়া পরিমাণ বিয়োগ হয়ে যাবে।`)) return;

    const result = await deletePurchaseEntryCascade(supabase, entry.id, entry.voucher_id);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-2">
        <input
          type="checkbox"
          checked={!!selected}
          onChange={onToggleSelect}
          aria-label={`Select purchase entry ${entry.entry_no ?? entry.id}`}
        />
      </td>
      <td className="px-4 py-2 font-medium">{entry.entry_no ?? "-"}</td>
      <td className="px-4 py-2 text-gray-500">
        {entry.entry_date}
        {entry.creator?.full_name && <div className="text-[11px] text-gray-400">by {entry.creator.full_name}</div>}
      </td>
      <td className="px-4 py-2">{entry.suppliers?.name ?? "-"}</td>
      <td className="px-4 py-2">{entry.invoice_no || "-"}</td>
      <td className="px-4 py-2">{entry.paymentLabel ?? "-"}</td>
      <td className="px-4 py-2 text-right">{money(total)}</td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <GuardedAction table="purchase_entries" recordId={entry.id} recordLabel={entry.entry_no ?? entry.id} action="edit"
          onAllowed={() => router.push(`/dashboard/purchase/entry/${entry.id}/edit`)}
          className="mr-2 rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100">Edit</GuardedAction>
        <GuardedAction table="purchase_entries" recordId={entry.id} recordLabel={entry.entry_no ?? entry.id} action="delete"
          onAllowed={handleDelete}
          className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">Delete</GuardedAction>
      </td>
    </tr>
  );
}
