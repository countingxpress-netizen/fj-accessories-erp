import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AddEmployeeForm from "./AddEmployeeForm";
import EmployeeRow from "./EmployeeRow";

export default async function EmployeesPage() {
  const supabase = await createClient();
  const { data: employees } = await supabase.from("employees").select("*").order("employee_code");

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Employees</h1>
        <Link href="/dashboard/payroll" className="text-sm text-gray-500 hover:underline">← Payroll-এ ফিরুন</Link>
      </div>
      <AddEmployeeForm />
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Designation</th>
              <th className="px-4 py-2">Department</th>
              <th className="px-4 py-2 text-right">Basic Salary</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(employees ?? []).map((e) => <EmployeeRow key={e.id} employee={e} />)}
            {(!employees || employees.length === 0) && (
              <tr><td colSpan={7} className="px-4 py-3 text-gray-400 italic">কোনো Employee যোগ করা হয়নি</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}