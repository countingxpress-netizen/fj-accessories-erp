import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/fetchAll";
import { money } from "@/lib/format";
import SalarySheetGenerator from "./SalarySheetGenerator";

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type Summary = {
  year: number; month: number; count: number; paid: number;
  basic: number; adj: number; bonus: number; deductions: number; net: number;
};

export default async function SalarySheetPage() {
  const supabase = await createClient();
  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, employee_code, basic_salary, designation, department, join_date")
    .eq("is_active", true).order("employee_code");
  const sheets = await fetchAllRows<any>(supabase as any, "salary_sheet",
    "year, month, basic, net_adjustment, attendance_bonus, advance, other_deduction, net_salary, paid");

  // মাস-ভিত্তিক সারাংশ — প্রতিটা জেনারেট করা Salary Sheet এক সারি
  const byPeriod = new Map<string, Summary>();
  for (const s of sheets) {
    const k = `${s.year}-${String(s.month).padStart(2, "0")}`;
    const cur = byPeriod.get(k) ?? { year: s.year, month: s.month, count: 0, paid: 0, basic: 0, adj: 0, bonus: 0, deductions: 0, net: 0 };
    cur.count++;
    if (s.paid) cur.paid++;
    cur.basic += Number(s.basic) || 0;
    cur.adj += Number(s.net_adjustment) || 0;
    cur.bonus += Number(s.attendance_bonus) || 0;
    cur.deductions += (Number(s.advance) || 0) + (Number(s.other_deduction) || 0);
    cur.net += Number(s.net_salary) || 0;
    byPeriod.set(k, cur);
  }
  const periods = [...byPeriod.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Salary Sheet</h1>
        <Link href="/dashboard/payroll" className="text-sm text-gray-500 hover:underline">← Payroll-এ ফিরুন</Link>
      </div>

      <div className="mb-6 overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">মাস</th>
              <th className="px-4 py-2 text-right">কর্মী</th>
              <th className="px-4 py-2 text-right">মোট Basic</th>
              <th className="px-4 py-2 text-right">OT / সমন্বয়</th>
              <th className="px-4 py-2 text-right">অন্যান্য</th>
              <th className="px-4 py-2 text-right">Advance</th>
              <th className="px-4 py-2 text-right">মোট বেতন (Payable)</th>
              <th className="px-4 py-2">পরিশোধ</th>
              <th className="px-4 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {periods.map(([k, p]) => (
              <tr key={k} className="border-t hover:bg-blue-50/40">
                <td className="px-4 py-2 font-medium">
                  <Link href={`/dashboard/payroll/salary-sheet/${k}`} className="text-blue-700 hover:underline">
                    {monthNames[p.month]} {p.year}
                  </Link>
                </td>
                <td className="px-4 py-2 text-right">{p.count}</td>
                <td className="px-4 py-2 text-right">{money(p.basic)}</td>
                <td className={`px-4 py-2 text-right ${p.adj < 0 ? "text-red-600" : ""}`}>{money(p.adj)}</td>
                <td className="px-4 py-2 text-right">{money(p.bonus)}</td>
                <td className="px-4 py-2 text-right">{money(p.deductions)}</td>
                <td className="px-4 py-2 text-right font-semibold">{money(p.net)}</td>
                <td className="px-4 py-2">
                  {p.paid === p.count ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">সব Paid</span>
                  ) : p.paid === 0 ? (
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">Unpaid</span>
                  ) : (
                    <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">{p.paid}/{p.count} Paid</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/dashboard/payroll/salary-sheet/${k}`} className="rounded bg-blue-50 px-3 py-1 text-xs text-blue-700 hover:bg-blue-100">খুলুন →</Link>
                </td>
              </tr>
            ))}
            {periods.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Salary Sheet জেনারেট হয়নি</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-lg font-semibold">নতুন মাসের Salary Sheet বানান</h2>
      <SalarySheetGenerator employees={employees ?? []} />
    </div>
  );
}
