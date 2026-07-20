import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const typeLabels: Record<string, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  income: "Income",
  expense: "Expenses",
};
const typeOrder = ["asset", "liability", "equity", "income", "expense"];

export default async function LedgerListPage() {
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("*")
    .order("account_code");

  const grouped: Record<string, typeof accounts> = {};
  (accounts ?? []).forEach((acc) => {
    grouped[acc.account_type] = grouped[acc.account_type] ?? [];
    grouped[acc.account_type]!.push(acc);
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">General Ledger</h1>
      <p className="text-sm text-gray-500 mb-6">
        যেকোনো অ্যাকাউন্টে ক্লিক করে তার সম্পূর্ণ লেনদেনের ইতিহাস দেখুন।
      </p>

      {typeOrder.map((type) => (
        <div key={type} className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">
            {typeLabels[type]}
          </h2>
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm divide-y">
            {(grouped[type] ?? []).map((acc) => (
              <Link
                key={acc.id}
                href={`/dashboard/accounting/ledger/${acc.id}`}
                className="flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-50"
              >
                <span>
                  <span className="text-gray-500 mr-2">{acc.account_code}</span>
                  {acc.account_name}
                </span>
                <span className="text-gray-400">→</span>
              </Link>
            ))}
            {(!grouped[type] || grouped[type]!.length === 0) && (
              <p className="px-4 py-3 text-gray-400 italic text-sm">কোনো অ্যাকাউন্ট নেই</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}