import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import OvertimeForm from "./OvertimeForm";

export default async function OvertimePage() {
  const supabase = await createClient();
  const { data: employees } = await supabase.from("employees").select("id, name, employee_code").eq("is_active", true).order("employee_code");
  const { data: overtimeEntries } = await supabase
    .from("overtime")
    .select("*, employees(name, employee_code)")
    .order("ot_date", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Overtime</h1>
        <Link href="/dashboard/payroll" className="text-sm text-gray-500 hover:underline">← Payroll-এ ফিরুন</Link>
      </div>
      <OvertimeForm employees={employees ?? []} />
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Employee</th>
              <th className="px-4 py-2 text-right">Hours</th>
              <th className="px-4 py-2 text-right">Rate/Hour</th>
              <th className="px-4 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(overtimeEntries ?? []).map((o: any) => (
              <tr key={o.id} className="border-t">
                <td className="px-4 py-2 text-gray-500">{formatDate(o.ot_date)}</td>
                <td className="px-4 py-2">{o.employees?.employee_code} — {o.employees?.name}</td>
                <td className="px-4 py-2 text-right">{o.hours}</td>
                <td className="px-4 py-2 text-right">{o.rate_per_hour}</td>
                <td className="px-4 py-2 text-right">{(o.hours * o.rate_per_hour).toFixed(2)}</td>
              </tr>
            ))}
            {(!overtimeEntries || overtimeEntries.length === 0) && (
              <tr><td colSpan={5} className="px-4 py-3 text-gray-400 italic">এখনো কোনো Overtime এন্ট্রি নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}