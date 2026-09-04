import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AdvanceForm from "./AdvanceForm";
import AdvanceRow from "./AdvanceRow";
import { money } from "@/lib/format";

export default async function AdvancesPage() {
  const supabase = await createClient();

  const [{ data: employees }, { data: advances }, { data: sheets }, { data: cashBank }] = await Promise.all([
    supabase.from("employees").select("id, name, employee_code").eq("is_active", true).order("employee_code"),
    supabase.from("employee_advances").select("*, employees(name, employee_code), creator:app_users!employee_advances_created_by_fkey(full_name)").order("advance_date", { ascending: false }),
    supabase.from("salary_sheet").select("employee_id, advance"),
    supabase.from("chart_of_accounts").select("id, account_code, account_name")
      .eq("account_type", "asset").gte("account_code", "1000").lt("account_code", "1100").order("account_code"),
  ]);

  // প্রতি কর্মীর বকেয়া অগ্রিম = মোট দেওয়া − Salary Sheet-এ recover করা
  const givenByEmp: Record<string, number> = {};
  (advances ?? []).forEach((a: any) => {
    givenByEmp[a.employee_id] = (givenByEmp[a.employee_id] ?? 0) + (Number(a.amount) || 0);
  });
  const recoveredByEmp: Record<string, number> = {};
  (sheets ?? []).forEach((s: any) => {
    if (!s.employee_id) return;
    recoveredByEmp[s.employee_id] = (recoveredByEmp[s.employee_id] ?? 0) + (Number(s.advance) || 0);
  });
  const outstanding = (employees ?? [])
    .map((e: any) => ({
      ...e,
      given: givenByEmp[e.id] ?? 0,
      recovered: recoveredByEmp[e.id] ?? 0,
      due: (givenByEmp[e.id] ?? 0) - (recoveredByEmp[e.id] ?? 0),
    }))
    .filter((e) => Math.abs(e.due) > 0.005);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Employee Advance</h1>
        <Link href="/dashboard/payroll" className="text-sm text-gray-500 hover:underline">← Payroll-এ ফিরুন</Link>
      </div>

      <p className="text-sm text-gray-500 mb-4 max-w-3xl">
        কর্মীকে অগ্রিম দিলে <span className="font-mono text-xs">Dr Advance to Employees (1260) / Cr Cash-Bank</span> JV হয়।
        Salary Sheet জেনারেট করার সময় &quot;Advance&quot; ঘরে যত বসাবেন তত অগ্রিম ওই মাসের বেতন থেকে recover হবে (accrual JV-তে <span className="font-mono text-xs">Cr 1260</span>)।
      </p>

      <AdvanceForm employees={employees ?? []} cashBankAccounts={cashBank ?? []} />

      {outstanding.length > 0 && (
        <div className="mt-6 rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">বকেয়া অগ্রিম</div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-2">Employee</th>
                <th className="px-4 py-2 text-right">মোট দেওয়া</th>
                <th className="px-4 py-2 text-right">Recover করা</th>
                <th className="px-4 py-2 text-right">বাকি</th>
              </tr>
            </thead>
            <tbody>
              {outstanding.map((e: any) => (
                <tr key={e.id} className="border-t">
                  <td className="px-4 py-2">{e.employee_code} — {e.name}</td>
                  <td className="px-4 py-2 text-right">{money(e.given)}</td>
                  <td className="px-4 py-2 text-right">{money(e.recovered)}</td>
                  <td className="px-4 py-2 text-right font-medium">{money(e.due)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700">অগ্রিমের ইতিহাস</div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Employee</th>
              <th className="px-4 py-2 text-right">Amount</th>
              <th className="px-4 py-2">Note</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(advances ?? []).map((a: any) => <AdvanceRow key={a.id} row={a} />)}
            {(!advances || advances.length === 0) && (
              <tr><td colSpan={5} className="px-4 py-3 text-gray-400 italic">এখনো কোনো অগ্রিম দেওয়া হয়নি</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
