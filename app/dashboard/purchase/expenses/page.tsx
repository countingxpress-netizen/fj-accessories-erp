import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ExpenseForm from "./ExpenseForm";
import ExpensesTable from "./ExpensesTable";

export default async function ExpensesPage({
  searchParams,
}: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { from, to } = await searchParams;
  const supabase = await createClient();

  const { data: expenseAccounts } = await supabase
    .from("chart_of_accounts").select("id, account_code, account_name")
    .eq("account_type", "expense").order("account_code");

  const { data: cashBankAccounts } = await supabase
    .from("chart_of_accounts").select("id, account_code, account_name")
    .eq("account_type", "asset")
    .or("account_name.ilike.%cash%,account_name.ilike.%bank%")
    .order("account_code");

  let query = supabase
    .from("expenses")
    .select("*, chart_of_accounts!expenses_account_id_fkey(account_name), creator:app_users!expenses_created_by_fkey(full_name)")
    .order("expense_date", { ascending: false });

  if (from) query = query.gte("expense_date", from);
  if (to) query = query.lte("expense_date", to);

  const { data: expenses } = await query;

  const total = (expenses ?? []).reduce((s, e) => s + (e.amount || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Expenses</h1>
        <Link href="/dashboard/purchase" className="text-sm text-gray-500 hover:underline">← Purchase-এ ফিরুন</Link>
      </div>

      <ExpenseForm expenseAccounts={expenseAccounts ?? []} cashBankAccounts={cashBankAccounts ?? []} />

      <form className="mt-6 mb-4 flex items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" name="from" defaultValue={from} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" name="to" defaultValue={to} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">ফিল্টার করুন</button>
      </form>

      <div className="rounded-xl border bg-white p-4 shadow-sm mb-4 max-w-xs">
        <p className="text-xs text-gray-500">Total Expense</p>
        <p className="text-lg font-semibold">{total.toFixed(2)}</p>
      </div>

      <ExpensesTable expenses={expenses ?? []} />
    </div>
  );
}