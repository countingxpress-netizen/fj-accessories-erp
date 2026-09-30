"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";
import { money } from "@/lib/format";
import { deleteCustomerAdjustment, adjustmentLabel } from "@/lib/customerAdjustment";
import GuardedAction from "@/app/dashboard/GuardedAction";

export default function CustomerAdjustmentRow({ adj }: { adj: any }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleDelete() {
    if (!window.confirm(`"${adj.adj_no}" মুছে ফেলতে চান? JV উল্টে যাবে; এর বিপরীতে কোনো Payment allocate করা থাকলে সেই টাকা Advance হয়ে যাবে।`)) return;
    setLoading(true);
    await deleteCustomerAdjustment(supabase, adj);
    setLoading(false);
    router.refresh();
  }

  const isCredit = adj.direction === "credit";
  return (
    <tr className="border-t">
      <td className="px-4 py-2 text-gray-500">
        {formatDate(adj.adj_date)}
        {adj.creator?.full_name && <div className="text-[11px] text-gray-400">by {adj.creator.full_name}</div>}
      </td>
      <td className="px-4 py-2 font-medium">
        {adj.adj_no}
        {adj.journal_vouchers?.voucher_no && <div className="text-[11px] text-gray-400">{adj.journal_vouchers.voucher_no}</div>}
      </td>
      <td className="px-4 py-2">{adj.customers?.name ?? "-"}</td>
      <td className="px-4 py-2">
        <span className={`rounded-full px-2 py-0.5 text-xs ${isCredit ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}>
          {adjustmentLabel(adj.direction)}
        </span>
      </td>
      <td className="px-4 py-2 text-gray-600">{adj.contra ? `${adj.contra.account_code} - ${adj.contra.account_name}` : "-"}</td>
      <td className="px-4 py-2 text-gray-600">{adj.note || "-"}</td>
      <td className="px-4 py-2 text-right font-medium">{money(adj.amount)}</td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <GuardedAction
          table="customer_adjustments" recordId={adj.id} recordLabel={adj.adj_no} action="delete"
          onAllowed={handleDelete} disabled={loading}
          className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
        >
          Delete
        </GuardedAction>
      </td>
    </tr>
  );
}
