"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { hourlyRate, monthRange } from "@/lib/payroll";

type Employee = {
  id: string; name: string; employee_code: string;
  designation: string | null; department: string | null; basic_salary: number;
};

const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function OvertimeReport({ employees }: { employees: Employee[] }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [hoursByEmp, setHoursByEmp] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    let active = true;
    setLoading(true);
    const { start, end } = monthRange(year, month);
    (async () => {
      const { data } = await supabase.from("overtime").select("employee_id, hours").gte("ot_date", start).lte("ot_date", end);
      if (!active) return;
      const m: Record<string, number> = {};
      (data ?? []).forEach((r: any) => { m[r.employee_id] = (m[r.employee_id] || 0) + (r.hours || 0); });
      setHoursByEmp(m);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [month, year]);

  const rows = employees
    .map((e) => {
      const hours = hoursByEmp[e.id] || 0;
      const rate = hourlyRate(e.basic_salary);
      return { e, hours, rate, amount: Math.round(rate * hours) };
    })
    .filter((r) => r.hours > 0);

  const totalHours = rows.reduce((s, r) => s + r.hours, 0);
  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Month</label>
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} className="rounded-lg border px-3 py-2 text-sm">
            {monthNames.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Year</label>
          <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="rounded-lg border px-3 py-2 text-sm w-28" />
        </div>
      </div>

      <p className="text-xs text-gray-500">
        OT ঘণ্টা Attendance স্ক্রিন থেকে আসে (দৈনিক এন্ট্রি)। Rate = Basic ÷ 26 ÷ 8। এটা শুধু রিপোর্ট — বেতনের চূড়ান্ত হিসাব Salary Sheet-এ।
      </p>

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Employee</th>
              <th className="px-4 py-2">Department</th>
              <th className="px-4 py-2 text-right">OT Hours</th>
              <th className="px-4 py-2 text-right">Rate/Hour</th>
              <th className="px-4 py-2 text-right">OT Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.e.id} className="border-t">
                <td className="px-4 py-2">{r.e.employee_code} — {r.e.name}</td>
                <td className="px-4 py-2 text-gray-500">{r.e.department || "-"}</td>
                <td className="px-4 py-2 text-right">{r.hours}</td>
                <td className="px-4 py-2 text-right">{r.rate.toFixed(2)}</td>
                <td className="px-4 py-2 text-right">{r.amount.toFixed(2)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-3 text-gray-400 italic">{loading ? "লোড হচ্ছে..." : "এই মাসে কোনো OT নেই"}</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-gray-50 font-medium">
              <tr>
                <td className="px-4 py-2" colSpan={2}>মোট</td>
                <td className="px-4 py-2 text-right">{totalHours}</td>
                <td />
                <td className="px-4 py-2 text-right">{totalAmount.toFixed(2)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
