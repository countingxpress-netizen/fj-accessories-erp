import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { salaryTypeOf, effectiveBasic, todayLocal, type SalaryRevision } from "@/lib/payroll";
import AddEmployeeForm from "./AddEmployeeForm";
import EmployeeRow from "./EmployeeRow";

export default async function EmployeesPage() {
  const supabase = await createClient();
  const { data: employees } = await supabase.from("employees").select("*").order("employee_code");
  const { data: revisions } = await supabase
    .from("salary_revisions").select("employee_id, effective_date, basic_salary");

  const today = todayLocal();
  const revByEmp = new Map<string, SalaryRevision[]>();
  (revisions ?? []).forEach((r: any) => {
    const l = revByEmp.get(r.employee_id) ?? [];
    l.push({ effective_date: r.effective_date, basic_salary: r.basic_salary });
    revByEmp.set(r.employee_id, l);
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Employees</h1>
        <Link href="/dashboard/payroll" className="text-sm text-gray-500 hover:underline">← Payroll-এ ফিরুন</Link>
      </div>
      <AddEmployeeForm />
      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Designation</th>
              <th className="px-4 py-2">Department</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2 text-right">Basic Salary</th>
              <th className="px-4 py-2 text-right">কার্যকর Basic</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(employees ?? []).map((e) => (
              <EmployeeRow
                key={e.id}
                employee={e}
                salaryType={salaryTypeOf(e.department, e.designation)}
                effectiveBasic={effectiveBasic(revByEmp.get(e.id), today, e.basic_salary)}
              />
            ))}
            {(!employees || employees.length === 0) && (
              <tr><td colSpan={9} className="px-4 py-3 text-gray-400 italic">কোনো Employee যোগ করা হয়নি</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-400">
        Basic Salary = শুরুর/মূল অঙ্ক। বেতন বাড়লে <Link href="/dashboard/payroll/salary-revisions" className="underline">Salary Revisions</Link>-এ যোগ করুন — কার্যকর Basic সেখান থেকে হিসাব হয়।
      </p>
    </div>
  );
}
