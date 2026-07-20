import { createClient } from "@/lib/supabase/server";
import AddAccountForm from "./AddAccountForm";
import AccountRow from "./AccountRow";

const typeLabels: Record<string, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  income: "Income",
  expense: "Expenses",
};

const typeOrder = ["asset", "liability", "equity", "income", "expense"];

export default async function AccountingPage() {
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
      <h1 className="text-2xl font-semibold mb-4">Chart of Accounts</h1>

      <div className="mb-6 flex flex-wrap gap-3">
        <a href="/dashboard/accounting/journal" className="inline-block rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">
          Journal Vouchers দেখুন / নতুন তৈরি করুন →
        </a>
        <a href="/dashboard/accounting/ledger" className="inline-block rounded-lg border border-gray-900 px-4 py-2 text-sm text-gray-900">
          General Ledger দেখুন →
        </a>
        <a href="/dashboard/accounting/trial-balance" className="inline-block rounded-lg border border-gray-900 px-4 py-2 text-sm text-gray-900">
          Trial Balance দেখুন →
        </a>
        <a href="/dashboard/accounting/cash-book" className="inline-block rounded-lg border border-gray-900 px-4 py-2 text-sm text-gray-900">
          Cash Book দেখুন →
        </a>
        <a href="/dashboard/accounting/bank-book" className="inline-block rounded-lg border border-gray-900 px-4 py-2 text-sm text-gray-900">
          Bank Book দেখুন →
        </a>
      </div>

      <AddAccountForm />

      {typeOrder.map((type) => (
        <div key={type} className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">
            {typeLabels[type]}
          </h2>
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-2">Code</th>
                  <th className="px-4 py-2">Account Name</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {(grouped[type] ?? []).map((acc) => (
                  <AccountRow key={acc.id} account={acc} />
                ))}
                {(!grouped[type] || grouped[type]!.length === 0) && (
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-gray-400 italic">
                      কোনো অ্যাকাউন্ট নেই
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}