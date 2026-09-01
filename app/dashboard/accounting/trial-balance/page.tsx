import React from "react";
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

export default async function TrialBalancePage() {
  const supabase = await createClient();

  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("*")
    .order("account_code");

  const { data: lines } = await supabase
    .from("journal_entry_lines")
    .select("account_id, debit, credit");

  // প্রতিটা account-এর মোট debit/credit যোগ করুন
  const totals: Record<string, { debit: number; credit: number }> = {};
  (lines ?? []).forEach((l) => {
    if (!totals[l.account_id]) totals[l.account_id] = { debit: 0, credit: 0 };
    totals[l.account_id].debit += l.debit || 0;
    totals[l.account_id].credit += l.credit || 0;
  });

  const rows = (accounts ?? [])
    .map((acc) => {
      const t = totals[acc.id] ?? { debit: 0, credit: 0 };
      const net = t.debit - t.credit;
      // Trial Balance: net debit (net > 0) Debit কলামে, net credit (net < 0) Credit কলামে।
      // অ্যাকাউন্টের "normal side" নয় — আসল ব্যালেন্স যে দিকে সেই দিকেই দেখানো হয়,
      // নাহলে মোট Debit ≠ মোট Credit হয়ে যায়।
      const debitBalance = Math.max(net, 0);
      const creditBalance = Math.max(-net, 0);
      return { ...acc, totalDebit: t.debit, totalCredit: t.credit, debitBalance, creditBalance };
    })
    .filter((r) => r.totalDebit > 0 || r.totalCredit > 0); // যেসব অ্যাকাউন্টে কোনো এন্ট্রিই নেই সেগুলো বাদ

  const grouped: Record<string, typeof rows> = {};
  rows.forEach((r) => {
    grouped[r.account_type] = grouped[r.account_type] ?? [];
    grouped[r.account_type]!.push(r);
  });

  const grandDebit = rows.reduce((sum, r) => sum + r.debitBalance, 0);
  const grandCredit = rows.reduce((sum, r) => sum + r.creditBalance, 0);
  const isBalanced = Math.abs(grandDebit - grandCredit) < 0.01;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">Trial Balance</h1>
        <Link href="/dashboard/accounting" className="text-sm text-gray-500 hover:underline">
          ← Accounting-এ ফিরুন
        </Link>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        সকল Journal Voucher-এর ভিত্তিতে অটোমেটিক তৈরি — সরাসরি এন্ট্রি করার প্রয়োজন নেই।
      </p>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Account Name</th>
              <th className="px-4 py-2 text-right">Debit</th>
              <th className="px-4 py-2 text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {typeOrder.map((type) =>
              (grouped[type] ?? []).length > 0 ? (
                <React.Fragment key={type}>
                  <tr className="border-t bg-gray-50/60">
                    <td colSpan={4} className="px-4 py-1 text-xs font-semibold uppercase text-gray-500">
                      {typeLabels[type]}
                    </td>
                  </tr>
                  {grouped[type]!.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-4 py-2 text-gray-500">{r.account_code}</td>
                      <td className="px-4 py-2">
                        <Link
                          href={`/dashboard/accounting/ledger/${r.id}`}
                          className="hover:underline hover:text-blue-700"
                        >
                          {r.account_name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {r.debitBalance > 0 ? r.debitBalance.toFixed(2) : ""}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {r.creditBalance > 0 ? r.creditBalance.toFixed(2) : ""}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ) : null
            )}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-3 text-gray-400 italic">
                  এখনো কোনো Journal Voucher এন্ট্রি নেই
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t-2 font-semibold bg-gray-50">
            <tr>
              <td colSpan={2} className="px-4 py-3 text-right">Grand Total</td>
              <td className="px-4 py-3 text-right">{grandDebit.toFixed(2)}</td>
              <td className="px-4 py-3 text-right">{grandCredit.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-4">
        {isBalanced ? (
          <p className="text-sm text-green-700 font-medium">
            ✅ Debit ও Credit মিলে গেছে — Trial Balance সঠিক আছে।
          </p>
        ) : (
          <p className="text-sm text-red-600 font-medium">
            ⚠ Debit ও Credit মিলছে না (পার্থক্য: {Math.abs(grandDebit - grandCredit).toFixed(2)}) — কোনো Journal Voucher ভুলভাবে এন্ট্রি হয়ে থাকতে পারে।
          </p>
        )}
      </div>
    </div>
  );
}