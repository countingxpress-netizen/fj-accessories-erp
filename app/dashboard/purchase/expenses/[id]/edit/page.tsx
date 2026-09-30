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

  // Md Abu Jafor (3000) / রিপন থিনার (1500) / এম কে এক্সেসোরিজ (2600, Sister Concern) দিয়ে খরচ
  // করা হলেও "Paid Via"-তে বাছা যায়। 2600 liability — JV: Dr খরচ / Cr 2600, অর্থাৎ F&J-এর
  // এম কে-র কাছে দেনা বাড়ে (পরে এম কে-কে টাকা দিলে Dr 2600 / Cr Cash-এ শোধ হয়)।
  const { data: extraPaidVia } = await supabase
    .from("chart_of_accounts").select("id, account_code, account_name")
    .in("account_code", ["1500", "2600", "3000"]).order("account_code");
  const paidViaAccounts = [...(cashBankAccounts ?? []), ...(extraPaidVia ?? [])];

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
