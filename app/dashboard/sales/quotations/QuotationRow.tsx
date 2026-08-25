"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";
import { deleteQuotationCascade } from "@/lib/quotationDelete";

export default function QuotationRow({
  quotation, selected, onToggleSelect,
}: { quotation: any; selected?: boolean; onToggleSelect?: () => void }) {
  const router = useRouter();
  const supabase = createClient();

  const total = (quotation.quotation_items ?? []).reduce((s: number, i: any) => s + i.quantity_pcs * i.unit_price, 0);

  async function handleDelete() {
    if (!window.confirm(`Quotation "${quotation.quotation_no}" মুছে ফেলতে চান?`)) return;

    const result = await deleteQuotationCascade(supabase, quotation.id);
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
          aria-label={`Select quotation ${quotation.quotation_no}`}
        />
      </td>
      <td className="px-4 py-2 font-medium">{quotation.quotation_no}</td>
      <td className="px-4 py-2 text-gray-500">{formatDate(quotation.quotation_date)}</td>
      <td className="px-4 py-2">{quotation.customers?.name ?? "-"}</td>
      <td className="px-4 py-2 text-right">{total.toFixed(2)}</td>
      <td className="px-4 py-2 capitalize">{quotation.status}</td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <button onClick={handleDelete} className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">Delete</button>
      </td>
    </tr>
  );
}
