"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { todayLocal } from "@/lib/payroll";
import { postPayrollPayment, reversePayrollJv } from "@/lib/payrollJv";
import GuardedAction from "@/app/dashboard/GuardedAction";
import { money } from "@/lib/format";

const monthNames = ["","January","February","March","April","May","June","July","August","September","October","November","December"];

type Account = { id: string; account_code: string; account_name: string };

export default function SalaryRow({ row, cashBankAccounts }: { row: any; cashBankAccounts: Account[] }) {
  const [loading, setLoading] = useState(false);
  const [payAccountId, setPayAccountId] = useState(cashBankAccounts[0]?.id ?? "");
  const router = useRouter();
  const supabase = createClient();

  async function handleMarkPaid() {
    if (!payAccountId) return;
    setLoading(true);

    const label = `${monthNames[row.month]} ${row.year}`;
    const voucherId = await postPayrollPayment(supabase, {
      date: todayLocal(),
      narration: `Salary paid to ${row.employees?.name} — ${label}`,
      amount: Number(row.net_salary) || 0,
      memo: `Salary ${label}`,
      depositAccountId: payAccountId,
    });

    if (voucherId) {
      await supabase.from("salary_sheet").update({ paid: true, voucher_id: voucherId }).eq("id", row.id);
    }

    setLoading(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!window.confirm("এই Salary Sheet এন্ট্রি মুছে ফেলতে চান? (accrual + payment দুই JV-ও মুছে যাবে)")) return;
    setLoading(true);
    // sheet row আগে মুছুন — voucher_id FK থাকলে voucher আগে মুছতে গেলে আটকে যায়
    await supabase.from("salary_sheet").delete().eq("id", row.id);
    await reversePayrollJv(supabase, row.voucher_id);
    await reversePayrollJv(supabase, row.accrual_voucher_id);
    setLoading(false);
    router.refresh();
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-2">{row.employees?.employee_code} — {row.employees?.name}</td>
      <td className="px-4 py-2">
        {monthNames[row.month]} {row.year}
        {row.creator?.full_name && <div className="text-[11px] text-gray-400">by {row.creator.full_name}</div>}
      </td>
      <td className="px-4 py-2 text-right">{money(row.basic)}</td>
      <td className="px-4 py-2 text-right">{row.salary_type === "fixed" ? "—" : (row.ot_hours ?? 0)}</td>
      <td className="px-4 py-2 text-right">{row.salary_type === "fixed" ? "—" : `${row.absent_days ?? 0}d`}</td>
      <td className={`px-4 py-2 text-right ${(row.net_adjustment ?? 0) < 0 ? "text-red-600" : ""}`}>
        {row.salary_type === "fixed" ? "—" : money((row.net_adjustment ?? 0))}
      </td>
      <td className="px-4 py-2 text-right">{money((row.advance ?? 0))}</td>
      <td className="px-4 py-2 text-right">{money((row.other_deduction ?? 0))}</td>
      <td className="px-4 py-2 text-right font-medium">{money(row.net_salary)}</td>
      <td className="px-4 py-2">
        {row.paid ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Paid</span> : <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">Unpaid</span>}
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
        <GuardedAction table="salary_sheet" recordId={row.id} recordLabel={`${row.employees?.name ?? ""} ${monthNames[row.month]} ${row.year}`} action="delete"
          onAllowed={handleDelete} disabled={loading}
          className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">Delete</GuardedAction>
      </td>
    </tr>
  );
}
