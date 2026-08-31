import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SalarySheetGenerator from "./SalarySheetGenerator";
import SalaryRow from "./SalaryRow";

export default async function SalarySheetPage() {
  const supabase = await createClient();
  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, employee_code, basic_salary, designation, department, join_date")
    .eq("is_active", true).order("employee_code");
  const { data: sheets } = await supabase
    .from("salary_sheet")
    .select("*, employees(name, employee_code)")
    .order("year", { ascending: false })
    .order("month", { ascending: false });
  const { data: cashBankAccounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name")
    .in("account_code", ["1000", "1010"])
    .order("account_code");

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Salary Sheet</h1>
        <Link href="/dashboard/payroll" className="text-sm text-gray-500 hover:underline">← Payroll-এ ফিরুন</Link>
      </div>

      <SalarySheetGenerator employees={employees ?? []} />

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Employee</th>
              <th className="px-4 py-2">Month</th>
              <th className="px-4 py-2 text-right">Basic</th>
              <th className="px-4 py-2 text-right">OT hrs</th>
              <th className="px-4 py-2 text-right">Absent</th>
              <th className="px-4 py-2 text-right">Net Adj.</th>
              <th className="px-4 py-2 text-right">Advance</th>
              <th className="px-4 py-2 text-right">Other Ded.</th>
              <th className="px-4 py-2 text-right">Net Salary</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(sheets ?? []).map((s) => <SalaryRow key={s.id} row={s} cashBankAccounts={cashBankAccounts ?? []} />)}
            {(!sheets || sheets.length === 0) && (
              <tr><td colSpan={11} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Salary Sheet জেনারেট হয়নি</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}