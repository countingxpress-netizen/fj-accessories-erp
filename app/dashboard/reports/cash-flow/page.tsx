import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";

export default async function CashFlowPage({
  searchParams,
}: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { from, to } = await searchParams;
  const supabase = await createClient();

  const { data: cashBankAccounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name")
    .eq("account_type", "asset")
    .or("account_name.ilike.%cash%,account_name.ilike.%bank%");

  const accountIds = (cashBankAccounts ?? []).map((a) => a.id);

  let query = supabase
    .from("journal_entry_lines")
    .select("*, journal_vouchers(voucher_no, voucher_date, narration), chart_of_accounts(account_name)")
    .in("account_id", accountIds.length ? accountIds : ["00000000-0000-0000-0000-000000000000"]);

  const { data: lines } = await query;

  let filtered = lines ?? [];
  if (from) filtered = filtered.filter((l: any) => (l.journal_vouchers?.voucher_date ?? "") >= from);
  if (to) filtered = filtered.filter((l: any) => (l.journal_vouchers?.voucher_date ?? "") <= to);

  const sorted = filtered.sort((a: any, b: any) => (a.journal_vouchers?.voucher_date ?? "").localeCompare(b.journal_vouchers?.voucher_date ?? ""));

  const totalInflow = sorted.reduce((s: number, l: any) => s + (l.debit || 0), 0);
  const totalOutflow = sorted.reduce((s: number, l: any) => s + (l.credit || 0), 0);
  const netCashFlow = totalInflow - totalOutflow;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Cash Flow</h1>
        <Link href="/dashboard/reports" className="text-sm text-gray-500 hover:underline">← Reports-এ ফিরুন</Link>
      </div>

      <form className="mb-4 flex items-end gap-3">
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

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Total Inflow</p>
          <p className="text-lg font-semibold text-green-700">{totalInflow.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Total Outflow</p>
          <p className="text-lg font-semibold text-red-700">{totalOutflow.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Net Cash Flow</p>
          <p className={`text-lg font-semibold ${netCashFlow >= 0 ? "text-green-700" : "text-red-700"}`}>{netCashFlow.toFixed(2)}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Account</th>
              <th className="px-4 py-2">Narration</th>
              <th className="px-4 py-2 text-right">Inflow</th>
              <th className="px-4 py-2 text-right">Outflow</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((l: any) => (
              <tr key={l.id} className="border-t">
                <td className="px-4 py-2 text-gray-500">{formatDate(l.journal_vouchers?.voucher_date)}</td>
                <td className="px-4 py-2">{l.chart_of_accounts?.account_name}</td>
                <td className="px-4 py-2 text-gray-600">{l.memo || l.journal_vouchers?.narration || "-"}</td>
                <td className="px-4 py-2 text-right">{l.debit ? l.debit.toFixed(2) : ""}</td>
                <td className="px-4 py-2 text-right">{l.credit ? l.credit.toFixed(2) : ""}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-3 text-gray-400 italic">এই সময়সীমায় কোনো লেনদেন নেই</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}