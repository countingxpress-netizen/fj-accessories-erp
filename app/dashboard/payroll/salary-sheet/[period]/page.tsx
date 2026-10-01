import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SalarySheetView from "./SalarySheetView";

// /dashboard/payroll/salary-sheet/2026-09 — এক মাসের পুরো Salary Sheet (দেখা / এডিট / প্রিন্ট)
export default async function SalarySheetPeriodPage({ params }: { params: Promise<{ period: string }> }) {
  const { period } = await params;
  const m = period.match(/^(\d{4})-(\d{2})$/);
  if (!m) notFound();
  const year = +m[1], month = +m[2];

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("salary_sheet")
    .select("*, employees(name, employee_code, designation, department, join_date)")
    .eq("year", year).eq("month", month);
  const { data: company } = await supabase.from("company_profile").select("name, address, phone, email, logo_url").single();
  const { data: cashBankAccounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name")
    .eq("account_type", "asset")
    .gte("account_code", "1000").lt("account_code", "1100")
    .order("account_code");

  const sorted = (rows ?? []).sort((a: any, b: any) =>
    (a.employees?.employee_code ?? "").localeCompare(b.employees?.employee_code ?? ""));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-semibold">Salary Sheet</h1>
        <Link href="/dashboard/payroll/salary-sheet" className="text-sm text-gray-500 hover:underline">← সব Salary Sheet</Link>
      </div>
      {sorted.length === 0 ? (
        <p className="rounded-xl border bg-white p-6 text-gray-500">এই মাসের কোনো Salary Sheet নেই।</p>
      ) : (
        <SalarySheetView year={year} month={month} rows={sorted} company={company} cashBankAccounts={cashBankAccounts ?? []} />
      )}
    </div>
  );
}
