import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function ProfitLossPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const supabase = await createClient();

  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name, account_type")
    .in("account_type", ["income", "expense"])
    .order("account_code");

  let query = supabase
    .from("journal_entry_lines")
    .select("account_id, debit, credit, journal_vouchers(voucher_date)");

  const { data: allLines } = await query;

  let lines = allLines ?? [];
  if (from) lines = lines.filter((l: any) => (l.journal_vouchers?.voucher_date ?? "") >= from);
  if (to) lines = lines.filter((l: any) => (l.journal_vouchers?.voucher_date ?? "") <= to);

  const totals: Record<string, { debit: number; credit: number }> = {};
  lines.forEach((l: any) => {
    if (!totals[l.account_id]) totals[l.account_id] = { debit: 0, credit: 0 };
    totals[l.account_id].debit += l.debit || 0;
    totals[l.account_id].credit += l.credit || 0;
  });

  const incomeRows = (accounts ?? [])
    .filter((a) => a.account_type === "income")
    .map((a) => {
      const t = totals[a.id] ?? { debit: 0, credit: 0 };
      return { ...a, amount: t.credit - t.debit };
    })
    .filter((r) => r.amount !== 0);

  const expenseRows = (accounts ?? [])
    .filter((a) => a.account_type === "expense")
    .map((a) => {
      const t = totals[a.id] ?? { debit: 0, credit: 0 };
      return { ...a, amount: t.debit - t.credit };
    })
    .filter((r) => r.amount !== 0);

  const totalIncome = incomeRows.reduce((sum, r) => sum + r.amount, 0);
  const totalExpense = expenseRows.reduce((sum, r) => sum + r.amount, 0);
  const netProfit = totalIncome - totalExpense;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">Profit &amp; Loss Statement</h1>
        <Link href="/dashboard/accounting" className="text-sm text-gray-500 hover:underline">
          ← Accounting-এ ফিরুন
        </Link>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        {from || to ? `${from || "শুরু থেকে"} থেকে ${to || "আজ"} পর্যন্ত` : "সর্বমোট (সব সময়ের)"}
      </p>

      <form className="mb-6 flex items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" name="from" defaultValue={from} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" name="to" defaultValue={to} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">
          ফিল্টার করুন
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="bg-green-50 px-4 py-2 font-semibold text-green-800">Income</div>
          <table className="w-full text-sm">
            <tbody>
              {incomeRows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-2">
                    {r.account_code} - {r.account_name}
                  </td>
                  <td className="px-4 py-2 text-right">{r.amount.toFixed(2)}</td>
                </tr>
              ))}
              {incomeRows.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-3 text-gray-400 italic">কোনো Income এন্ট্রি নেই</td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t-2 font-semibold bg-gray-50">
              <tr>
                <td className="px-4 py-2">Total Income</td>
                <td className="px-4 py-2 text-right">{totalIncome.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="bg-red-50 px-4 py-2 font-semibold text-red-800">Expenses</div>
          <table className="w-full text-sm">
            <tbody>
              {expenseRows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-2">
                    {r.account_code} - {r.account_name}
                  </td>
                  <td className="px-4 py-2 text-right">{r.amount.toFixed(2)}</td>
                </tr>
              ))}
              {expenseRows.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-3 text-gray-400 italic">কোনো Expense এন্ট্রি নেই</td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t-2 font-semibold bg-gray-50">
              <tr>
                <td className="px-4 py-2">Total Expense</td>
                <td className="px-4 py-2 text-right">{totalExpense.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className={`mt-6 rounded-xl border p-4 text-center text-lg font-semibold ${
        netProfit >= 0 ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-800 border-red-200"
      }`}>
        {netProfit >= 0 ? "Net Profit" : "Net Loss"}: {Math.abs(netProfit).toFixed(2)}
      </div>
    </div>
  );
}