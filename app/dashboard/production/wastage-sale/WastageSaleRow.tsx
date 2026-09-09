"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";
import { money } from "@/lib/format";
import { reverseWastageSale } from "@/lib/wastageSale";
import GuardedAction from "@/app/dashboard/GuardedAction";

export default function WastageSaleRow({ sale }: { sale: any }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleDelete() {
    if (!window.confirm(`"${sale.sale_no}" বিক্রি মুছে ফেলতে চান? JV উল্টে যাবে${sale.source === "recycled_chips" ? " ও Recycled Chips স্টক ফেরত আসবে" : ""}।`)) return;
    setLoading(true);
    await reverseWastageSale(supabase, sale);
    setLoading(false);
    router.refresh();
  }

  const sourceLabel = sale.source === "recycled_chips"
    ? `Recycled Chips${sale.warehouses?.name ? ` — ${sale.warehouses.name}` : ""}`
    : sale.source === "wastage_stock"
      ? "Wastage stock"
      : "আলগা স্ক্র্যাপ";

  const soldTo = sale.customers?.name
    ?? (sale.party ? `${sale.party.account_code} - ${sale.party.account_name}` : (sale.sold_to_name || "-"));

  return (
    <tr className="border-t">
      <td className="px-4 py-2 text-gray-500">
        {formatDate(sale.sale_date)}
        {sale.creator?.full_name && <div className="text-[11px] text-gray-400">by {sale.creator.full_name}</div>}
      </td>
      <td className="px-4 py-2 font-medium">{sale.sale_no}</td>
      <td className="px-4 py-2 text-gray-600">{sourceLabel}</td>
      <td className="px-4 py-2 text-gray-600">
        {soldTo}
        {sale.customers?.name && <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">বাকি</span>}
      </td>
      <td className="px-4 py-2 text-right">{money(sale.quantity_lbs)}</td>
      <td className="px-4 py-2 text-right">{money(sale.rate_per_lbs)}</td>
      <td className="px-4 py-2 text-right font-medium">{money(sale.amount)}</td>
      <td className="px-4 py-2 text-right text-gray-500">{sale.source === "recycled_chips" ? money(sale.cogs_amount) : "-"}</td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <GuardedAction
          table="wastage_sales" recordId={sale.id} recordLabel={sale.sale_no} action="delete"
          onAllowed={handleDelete} disabled={loading}
          className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
        >
          Delete
        </GuardedAction>
      </td>
    </tr>
  );
}
