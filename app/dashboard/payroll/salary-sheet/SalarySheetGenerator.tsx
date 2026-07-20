"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";

type Employee = { id: string; name: string; employee_code: string; basic_salary: number };

const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function SalarySheetGenerator({ employees }: { employees: Employee[] }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [deductions, setDeductions] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const monthEnd = new Date(year, month, 0).toISOString().slice(0, 10);

    for (const emp of employees) {
      // এই মাসে আগে থেকেই salary sheet আছে কিনা চেক করুন
      const { data: existing } = await supabase
        .from("salary_sheet").select("id").eq("employee_id", emp.id).eq("month", month).eq("year", year).maybeSingle();
      if (existing) continue; // ইতিমধ্যে আছে, স্কিপ করুন

      const { data: otEntries } = await supabase
        .from("overtime").select("hours, rate_per_hour")
        .eq("employee_id", emp.id).gte("ot_date", monthStart).lte("ot_date", monthEnd);
      const overtimeAmount = (otEntries ?? []).reduce((s, o) => s + o.hours * o.rate_per_hour, 0);

      const deduction = parseFloat(deductions[emp.id] || "0");
      const netSalary = emp.basic_salary + overtimeAmount - deduction;

      await supabase.from("salary_sheet").insert({
        employee_id: emp.id, month, year, basic: emp.basic_salary,
        overtime_amount: overtimeAmount, deductions: deduction, net_salary: netSalary, paid: false,
      });
    }

    setLoading(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleGenerate} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 mb-6">
      <div className="flex gap-4">
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

      <p className="text-xs text-gray-500">Deduction (ঐচ্ছিক, প্রতি Employee-এর জন্য আলাদা দিতে পারেন):</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {employees.map((emp) => (
          <div key={emp.id} className="flex items-center gap-2">
            <span className="text-xs text-gray-600 w-24 truncate">{emp.name}</span>
            <input
              type="number" step="0.01" placeholder="0"
              value={deductions[emp.id] || ""}
              onChange={(e) => setDeductions((prev) => ({ ...prev, [emp.id]: e.target.value }))}
              className="w-20 rounded border px-2 py-1 text-xs"
            />
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "জেনারেট হচ্ছে..." : "Salary Sheet জেনারেট করুন"}
      </button>
      <p className="text-xs text-gray-400">যেসব Employee-এর এই মাসের Salary Sheet আগে থেকে আছে, তাদেরটা স্কিপ হবে (duplicate হবে না)।</p>
    </form>
  );
}