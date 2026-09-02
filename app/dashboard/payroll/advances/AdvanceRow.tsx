"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";
import { reversePayrollJv } from "@/lib/payrollJv";
import GuardedAction from "@/app/dashboard/GuardedAction";

export default function AdvanceRow({ row }: { row: any }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleDelete() {
    if (!window.confirm("এই অগ্রিম এন্ট্রি মুছে ফেলতে চান? লিংক করা JV-ও মুছে যাবে।")) return;
    setLoading(true);
    await supabase.from("employee_advances").delete().eq("id", row.id);
    await reversePayrollJv(supabase, row.voucher_id);
    setLoading(false);
    router.refresh();
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-2 text-gray-500">{formatDate(row.advance_date)}</td>
      <td className="px-4 py-2">{row.employees?.employee_code} — {row.employees?.name}</td>
      <td className="px-4 py-2 text-right font-medium">{Number(row.amount).toFixed(2)}</td>
      <td className="px-4 py-2 text-gray-600">{row.note || "-"}</td>
      <td className="px-4 py-2 text-right">
        <GuardedAction table="employee_advances" recordId={row.id} recordLabel={`${row.employees?.name ?? ""} ${formatDate(row.advance_date)}`} action="delete"
          onAllowed={handleDelete} disabled={loading}
          className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">Delete</GuardedAction>
      </td>
    </tr>
  );
}
