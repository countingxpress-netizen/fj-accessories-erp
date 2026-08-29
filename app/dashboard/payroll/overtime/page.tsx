import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import OvertimeReport from "./OvertimeReport";

export default async function OvertimePage() {
  const supabase = await createClient();
  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, employee_code, designation, department, basic_salary")
    .eq("is_active", true).order("employee_code");

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Overtime রিপোর্ট</h1>
        <Link href="/dashboard/payroll" className="text-sm text-gray-500 hover:underline">← Payroll-এ ফিরুন</Link>
      </div>
      <OvertimeReport employees={employees ?? []} />
    </div>
  );
}
