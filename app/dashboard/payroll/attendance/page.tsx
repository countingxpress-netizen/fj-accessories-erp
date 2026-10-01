import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AttendanceGrid from "./AttendanceGrid";

export default async function AttendancePage() {
  const supabase = await createClient();
  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, employee_code, designation, department, basic_salary, join_date")
    .eq("is_active", true).order("employee_code");
  const { data: revisions } = await supabase
    .from("salary_revisions").select("employee_id, effective_date, basic_salary");

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Attendance</h1>
        <Link href="/dashboard/payroll" className="text-sm text-gray-500 hover:underline">← Payroll-এ ফিরুন</Link>
      </div>
      <AttendanceGrid employees={employees ?? []} revisions={revisions ?? []} />
    </div>
  );
}
