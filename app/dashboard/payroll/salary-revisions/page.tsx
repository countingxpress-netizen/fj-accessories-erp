import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import RevisionManager from "./RevisionManager";

export default async function SalaryRevisionsPage() {
  const supabase = await createClient();
  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, employee_code, basic_salary")
    .eq("is_active", true).order("employee_code");
  const { data: revisions } = await supabase
    .from("salary_revisions")
    .select("id, employee_id, effective_date, basic_salary, note")
    .order("effective_date", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Salary Revisions</h1>
        <Link href="/dashboard/payroll" className="text-sm text-gray-500 hover:underline">← Payroll-এ ফিরুন</Link>
      </div>
      <RevisionManager employees={employees ?? []} revisions={revisions ?? []} />
    </div>
  );
}
