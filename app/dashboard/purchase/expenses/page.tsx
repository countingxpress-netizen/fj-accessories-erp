import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ExpenseForm from "./ExpenseForm";
import ExpensesTable from "./ExpensesTable";
import { money } from "@/lib/format";
import { resolveDatePreset } from "@/lib/datePresets";
import DateRangeFields from "@/components/DateRangeFields";
import AutoSubmitForm from "@/components/AutoSubmitForm";

export default async function ExpensesPage({
  searchParams,
}: { searchParams: Promise<{ range?: string; from?: string; to?: string; clone?: string }> }) {
  const { clone, range, from: rawFrom, to: rawTo } = await searchParams;
  // তারিখ-ফিল্টার preset (Today … Previous Year / Date Range / All Time) — ডিফল্ট All Time (আগের মতো)
  const period = resolveDatePreset(range, rawFrom, rawTo, "all");
  const from = period.from || undefined;
  const to = period.to || undefined;
  const supabase = await createClient();

  const { data: expenseAccounts } = await supabase
    .from("chart_of_accounts").select("id, account_code, account_name")
    .eq("account_type", "expense").order("account_code");

  const { data: cashBankAccounts } = await supabase
    .from("chart_of_accounts").select("id, account_code, account_name")
    .eq("account_type", "asset")
    .or("account_name.ilike.%cash%,account_name.ilike.%bank%")
    .order("account_code");

  // Md Abu Jafor (3000) / রিপন থিনার (1500) / এম কে এক্সেসোরিজ (2600, Sister Concern) দিয়ে খরচ
  // করা হলেও "Paid Via"-তে বাছা যায়। 2600 liability — JV: Dr খরচ / Cr 2600, অর্থাৎ F&J-এর
  // এম কে-র কাছে দেনা বাড়ে (পরে এম কে-কে টাকা দিলে Dr 2600 / Cr Cash-এ শোধ হয়)।
  const { data: extraPaidVia } = await supabase
    .from("chart_of_accounts").select("id, account_code, account_name")
    .in("account_code", ["1500", "2600", "3000"]).order("account_code");
  const paidViaAccounts = [...(cashBankAccounts ?? []), ...(extraPaidVia ?? [])];

  // ?clone=<expense id> — Zoho-র মতো Clone (ফর্মে পুরনো Expense-এর তথ্য ভরা)
  const { data: cloneSource } = clone
    ? await supabase.from("expenses").select("expense_date, account_id, paid_via_account_id, amount, payee, description").eq("id", clone).maybeSingle()
    : { data: null };

  let query = supabase
    .from("expenses")
    .select("*, chart_of_accounts!expenses_account_id_fkey(account_name), creator:app_users!expenses_created_by_fkey(full_name)")
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });

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

      <ExpenseForm
        key={clone ?? "new"}
        expenseAccounts={expenseAccounts ?? []}
        cashBankAccounts={paidViaAccounts}
        cloneFrom={cloneSource ? {
          label: `${cloneSource.expense_date} তারিখের Expense`,
          account_id: cloneSource.account_id, paid_via_account_id: cloneSource.paid_via_account_id,
          amount: Number(cloneSource.amount) || 0, payee: cloneSource.payee, description: cloneSource.description,
        } : null}
      />

      <AutoSubmitForm className="mt-6 mb-4 flex flex-wrap items-end gap-3">
        <DateRangeFields preset={period.preset} from={period.from} to={period.to} includeAll />
      </AutoSubmitForm>

      <div className="rounded-xl border bg-white p-4 shadow-sm mb-4 max-w-xs">
        <p className="text-xs text-gray-500">Total Expense</p>
        <p className="text-lg font-semibold">{money(total)}</p>
      </div>

      <ExpensesTable expenses={expenses ?? []} />
    </div>
  );
}