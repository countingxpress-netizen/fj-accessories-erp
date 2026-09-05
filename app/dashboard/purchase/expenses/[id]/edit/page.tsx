import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import EditExpenseForm from "./EditExpenseForm";

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: expense } = await supabase.from("expenses").select("*").eq("id", id).single();
  if (!expense) return notFound();

  const { data: expenseAccounts } = await supabase
    .from("chart_of_accounts").select("id, account_code, account_name")
    .eq("account_type", "expense").order("account_code");

  const { data: cashBankAccounts } = await supabase
    .from("chart_of_accounts").select("id, account_code, account_name")
    .eq("account_type", "asset")
    .or("account_name.ilike.%cash%,account_name.ilike.%bank%")
    .order("account_code");

  // Md Abu Jafor (3000) থেকে টাকা নিয়ে খরচ করা এন্ট্রি এডিটেও দরকার
  const { data: mdJaforAccount } = await supabase
    .from("chart_of_accounts").select("id, account_code, account_name")
    .eq("account_code", "3000").maybeSingle();
  const paidViaAccounts = mdJaforAccount ? [...(cashBankAccounts ?? []), mdJaforAccount] : (cashBankAccounts ?? []);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Expense এডিট করুন</h1>
        <Link href="/dashboard/purchase/expenses" className="text-sm text-gray-500 hover:underline">← Expenses-এ ফিরুন</Link>
      </div>
      <EditExpenseForm expense={expense} expenseAccounts={expenseAccounts ?? []} cashBankAccounts={paidViaAccounts} />
    </div>
  );
}
