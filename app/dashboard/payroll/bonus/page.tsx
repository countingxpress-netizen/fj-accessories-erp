import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import BonusGenerator from "./BonusGenerator";
import BonusRow from "./BonusRow";

export default async function BonusPage() {
  const supabase = await createClient();
  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, employee_code, basic_salary, join_date")
    .eq("is_active", true).order("employee_code");
  const { data: revisions } = await supabase
    .from("salary_revisions")
    .select("employee_id, effective_date, basic_salary");
  const { data: sheets } = await supabase
    .from("bonus_sheet")
    .select("*, employees(name, employee_code)")
    .order("year", { ascending: false })
    .order("festival");
  const { data: cashBankAccounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name")
    .in("account_code", ["1000", "1010"])
    .order("account_code");

  const existing = (sheets ?? []).map((s: any) => ({
    id: s.id, employee_id: s.employee_id, festival: s.festival, year: s.year,
    bonus_amount: Number(s.bonus_amount) || 0, paid: !!s.paid,
    accrual_voucher_id: s.accrual_voucher_id ?? null,
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Eid Bonus</h1>
        <Link href="/dashboard/payroll" className="text-sm text-gray-500 hover:underline">← Payroll-এ ফিরুন</Link>
      </div>

      <BonusGenerator employees={employees ?? []} revisions={revisions ?? []} existing={existing} />

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Employee</th>
              <th className="px-4 py-2">Festival</th>
              <th className="px-4 py-2">Bonus Date</th>
              <th className="px-4 py-2 text-right">Basic</th>
              <th className="px-4 py-2 text-right">চাকরির মাস</th>
              <th className="px-4 py-2 text-right">Bonus</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(sheets ?? []).map((s: any) => <BonusRow key={s.id} row={s} cashBankAccounts={cashBankAccounts ?? []} />)}
            {(!sheets || sheets.length === 0) && (
              <tr><td colSpan={8} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Bonus Sheet জেনারেট হয়নি</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
