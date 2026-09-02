"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/formatDate";
import { todayLocal } from "@/lib/payroll";
import { postPayrollPayment, reversePayrollJv } from "@/lib/payrollJv";
import GuardedAction from "@/app/dashboard/GuardedAction";

const festivalLabel: Record<string, string> = {
  eid_ul_fitr: "Eid-ul-Fitr",
  eid_ul_azha: "Eid-ul-Azha",
};

type Account = { id: string; account_code: string; account_name: string };

export default function BonusRow({ row, cashBankAccounts }: { row: any; cashBankAccounts: Account[] }) {
  const [loading, setLoading] = useState(false);
  const [payAccountId, setPayAccountId] = useState(cashBankAccounts[0]?.id ?? "");
  const router = useRouter();
  const supabase = createClient();

  async function handleMarkPaid() {
    if (!payAccountId) return;
    setLoading(true);
    const label = `${festivalLabel[row.festival] ?? row.festival} ${row.year}`;
    const voucherId = await postPayrollPayment(supabase, {
      date: todayLocal(),
      narration: `Festival bonus paid to ${row.employees?.name} — ${label}`,
      amount: Number(row.bonus_amount) || 0,
      memo: `Bonus ${label}`,
      depositAccountId: payAccountId,
    });
    if (voucherId) {
      await supabase.from("bonus_sheet").update({ paid: true, voucher_id: voucherId }).eq("id", row.id);
    }
    setLoading(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!window.confirm("এই Bonus এন্ট্রি মুছে ফেলতে চান? (accrual + payment দুই JV-ও মুছে যাবে)")) return;
    setLoading(true);
    // sheet row আগে মুছুন — voucher_id FK থাকলে voucher আগে মুছতে গেলে আটকে যায়
    await supabase.from("bonus_sheet").delete().eq("id", row.id);
    await reversePayrollJv(supabase, row.voucher_id);
    await reversePayrollJv(supabase, row.accrual_voucher_id);
    setLoading(false);
    router.refresh();
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-2">{row.employees?.employee_code} — {row.employees?.name}</td>
      <td className="px-4 py-2">{festivalLabel[row.festival] ?? row.festival} {row.year}</td>
      <td className="px-4 py-2 text-gray-500">{formatDate(row.bonus_date)}</td>
      <td className="px-4 py-2 text-right">{row.basic?.toFixed(2)}</td>
      <td className="px-4 py-2 text-right">{row.tenure_months?.toFixed(1)}</td>
      <td className="px-4 py-2 text-right font-medium">{row.bonus_amount?.toFixed(2)}</td>
      <td className="px-4 py-2">
        {row.paid
          ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Paid</span>
          : <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">Unpaid</span>}
      </td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        {!row.paid && (
          <span className="inline-flex items-center gap-1 mr-2">
            <select
              value={payAccountId}
              onChange={(e) => setPayAccountId(e.target.value)}
              className="rounded border px-1 py-1 text-xs"
              title="কোন অ্যাকাউন্ট থেকে পরিশোধ"
            >
              {cashBankAccounts.length === 0 && <option value="">Cash/Bank নেই</option>}
              {cashBankAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
            </select>
            <button onClick={handleMarkPaid} disabled={loading || !payAccountId} className="rounded bg-green-50 px-2 py-1 text-xs text-green-700 hover:bg-green-100 disabled:opacity-40">Mark Paid</button>
          </span>
        )}
        <GuardedAction table="bonus_sheet" recordId={row.id} recordLabel={`${row.employees?.name ?? ""} ${festivalLabel[row.festival] ?? row.festival} ${row.year}`} action="delete"
          onAllowed={handleDelete} disabled={loading}
          className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">Delete</GuardedAction>
      </td>
    </tr>
  );
}
