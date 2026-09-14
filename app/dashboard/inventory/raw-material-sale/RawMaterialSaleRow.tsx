"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";
import { money } from "@/lib/format";
import { reverseRawMaterialSale } from "@/lib/rawMaterialSale";
import GuardedAction from "@/app/dashboard/GuardedAction";

export default function RawMaterialSaleRow({ sale }: { sale: any }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleDelete() {
    if (!window.confirm(`"${sale.sale_no}" বিক্রি মুছে ফেলতে চান? JV উল্টে যাবে ও স্টক ফেরত আসবে।`)) return;
    setLoading(true);
    await reverseRawMaterialSale(supabase, sale);
    setLoading(false);
    router.refresh();
  }

  const soldTo = sale.customers?.name
    ?? (sale.party ? `${sale.party.account_code} - ${sale.party.account_name}` : (sale.sold_to_name || "-"));

  return (
    <tr className="border-t">
      <td className="px-4 py-2 text-gray-500">
        {formatDate(sale.sale_date)}
        {sale.creator?.full_name && <div className="text-[11px] text-gray-400">by {sale.creator.full_name}</div>}
      </td>
      <td className="px-4 py-2 font-medium">{sale.sale_no}</td>
      <td className="px-4 py-2 text-gray-600">
        {sale.raw_materials?.material_name ?? "-"}
        {sale.warehouses?.name && <div className="text-[11px] text-gray-400">{sale.warehouses.name}</div>}
      </td>
      <td className="px-4 py-2 text-gray-600">
        {soldTo}
        {sale.payment_received
          ? <span className="ml-1 rounded-full bg-green-100 px-1.5 py-0.5 text-[11px] text-green-700">নগদ</span>
          : <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">বাকি</span>}
      </td>
      <td className="px-4 py-2 text-right">{money(sale.quantity)} <span className="text-gray-400 text-xs">{sale.unit === "kg" ? "কেজি" : "Lbs"}</span></td>
      <td className="px-4 py-2 text-right">{money(sale.rate)}</td>
      <td className="px-4 py-2 text-right font-medium">{money(sale.amount)}</td>
      <td className="px-4 py-2 text-right text-gray-500">{money(sale.cogs_amount)}</td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <GuardedAction
          table="raw_material_sales" recordId={sale.id} recordLabel={sale.sale_no} action="edit"
          onAllowed={() => router.push(`/dashboard/inventory/raw-material-sale/${sale.id}/edit`)}
          className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 mr-2 hover:bg-blue-100"
        >
          Edit
        </GuardedAction>
        <GuardedAction
          table="raw_material_sales" recordId={sale.id} recordLabel={sale.sale_no} action="delete"
          onAllowed={handleDelete} disabled={loading}
          className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
        >
          Delete
        </GuardedAction>
      </td>
    </tr>
  );
}
