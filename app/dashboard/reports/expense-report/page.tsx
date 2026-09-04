import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/format";

export default async function ExpenseReportPage({
  searchParams,
}: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { from, to } = await searchParams;
  const supabase = await createClient();

  const { data: expenseAccounts } = await supabase
    .from("chart_of_accounts").select("id, account_code, account_name").eq("account_type", "expense").order("account_code");

  const { data: allLines } = await supabase
    .from("journal_entry_lines")
    .select("account_id, debit, credit, journal_vouchers(voucher_date)");

  let lines = allLines ?? [];
  if (from) lines = lines.filter((l: any) => (l.journal_vouchers?.voucher_date ?? "") >= from);
  if (to) lines = lines.filter((l: any) => (l.journal_vouchers?.voucher_date ?? "") <= to);

  const totals: Record<string, number> = {};
  lines.forEach((l: any) => {
    totals[l.account_id] = (totals[l.account_id] ?? 0) + (l.debit || 0) - (l.credit || 0);
  });

  const rows = (expenseAccounts ?? [])
    .map((a) => ({ ...a, amount: totals[a.id] ?? 0 }))
    .filter((r) => r.amount !== 0)
    .sort((a, b) => b.amount - a.amount);

  const total = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Expense Report</h1>
        <Link href="/dashboard/reports" className="text-sm text-gray-500 hover:underline">← Reports-এ ফিরুন</Link>
      </div>

      <form className="mb-6 flex items-end gap-3">
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

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr><th className="px-4 py-2">Code</th><th className="px-4 py-2">Expense Head</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2 text-right">%</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2 text-gray-500">{r.account_code}</td>
                <td className="px-4 py-2">{r.account_name}</td>
                <td className="px-4 py-2 text-right">{money(r.amount)}</td>
                <td className="px-4 py-2 text-right text-gray-500">{total > 0 ? ((r.amount / total) * 100).toFixed(1) : "0"}%</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-3 text-gray-400 italic">এই সময়সীমায় কোনো খরচ নেই</td></tr>
            )}
          </tbody>
          <tfoot className="border-t-2 font-semibold bg-gray-50">
            <tr><td colSpan={2} className="px-4 py-3 text-right">Total Expense</td><td className="px-4 py-3 text-right">{money(total)}</td><td></td></tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}