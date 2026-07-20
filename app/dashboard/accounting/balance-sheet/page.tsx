import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  const { asOf } = await searchParams;
  const supabase = await createClient();

  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name, account_type")
    .order("account_code");

  const { data: allLines } = await supabase
    .from("journal_entry_lines")
    .select("account_id, debit, credit, journal_vouchers(voucher_date)");

  let lines = allLines ?? [];
  if (asOf) lines = lines.filter((l: any) => (l.journal_vouchers?.voucher_date ?? "") <= asOf);

  const totals: Record<string, { debit: number; credit: number }> = {};
  lines.forEach((l: any) => {
    if (!totals[l.account_id]) totals[l.account_id] = { debit: 0, credit: 0 };
    totals[l.account_id].debit += l.debit || 0;
    totals[l.account_id].credit += l.credit || 0;
  });

  const assetRows = (accounts ?? [])
    .filter((a) => a.account_type === "asset")
    .map((a) => {
      const t = totals[a.id] ?? { debit: 0, credit: 0 };
      return { ...a, amount: t.debit - t.credit };
    })
    .filter((r) => r.amount !== 0);

  const liabilityRows = (accounts ?? [])
    .filter((a) => a.account_type === "liability")
    .map((a) => {
      const t = totals[a.id] ?? { debit: 0, credit: 0 };
      return { ...a, amount: t.credit - t.debit };
    })
    .filter((r) => r.amount !== 0);

  const equityRows = (accounts ?? [])
    .filter((a) => a.account_type === "equity")
    .map((a) => {
      const t = totals[a.id] ?? { debit: 0, credit: 0 };
      return { ...a, amount: t.credit - t.debit };
    })
    .filter((r) => r.amount !== 0);

  // Net Profit (Income - Expense, সব সময়ের, asOf তারিখ পর্যন্ত) — Retained Earnings হিসেবে যোগ হবে
  const incomeTotal = (accounts ?? [])
    .filter((a) => a.account_type === "income")
    .reduce((sum, a) => {
      const t = totals[a.id] ?? { debit: 0, credit: 0 };
      return sum + (t.credit - t.debit);
    }, 0);
  const expenseTotal = (accounts ?? [])
    .filter((a) => a.account_type === "expense")
    .reduce((sum, a) => {
      const t = totals[a.id] ?? { debit: 0, credit: 0 };
      return sum + (t.debit - t.credit);
    }, 0);
  const netProfit = incomeTotal - expenseTotal;

  const totalAssets = assetRows.reduce((sum, r) => sum + r.amount, 0);
  const totalLiabilities = liabilityRows.reduce((sum, r) => sum + r.amount, 0);
  const totalEquityBase = equityRows.reduce((sum, r) => sum + r.amount, 0);
  const totalEquity = totalEquityBase + netProfit;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
  const isBalanced = Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">Balance Sheet</h1>
        <Link href="/dashboard/accounting" className="text-sm text-gray-500 hover:underline">
          ← Accounting-এ ফিরুন
        </Link>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        {asOf ? `${asOf} তারিখ পর্যন্ত` : "আজ পর্যন্ত (সব এন্ট্রি)"}
      </p>

      <form className="mb-6 flex items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">As of Date</label>
          <input type="date" name="asOf" defaultValue={asOf} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">
          দেখুন
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ASSETS */}
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="bg-blue-50 px-4 py-2 font-semibold text-blue-800">Assets</div>
          <table className="w-full text-sm">
            <tbody>
              {assetRows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-2">{r.account_code} - {r.account_name}</td>
                  <td className="px-4 py-2 text-right">{r.amount.toFixed(2)}</td>
                </tr>
              ))}
              {assetRows.length === 0 && (
                <tr><td colSpan={2} className="px-4 py-3 text-gray-400 italic">কোনো এন্ট্রি নেই</td></tr>
              )}
            </tbody>
            <tfoot className="border-t-2 font-semibold bg-gray-50">
              <tr>
                <td className="px-4 py-2">Total Assets</td>
                <td className="px-4 py-2 text-right">{totalAssets.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* LIABILITIES + EQUITY */}
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <div className="bg-orange-50 px-4 py-2 font-semibold text-orange-800">Liabilities</div>
            <table className="w-full text-sm">
              <tbody>
                {liabilityRows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-2">{r.account_code} - {r.account_name}</td>
                    <td className="px-4 py-2 text-right">{r.amount.toFixed(2)}</td>
                  </tr>
                ))}
                {liabilityRows.length === 0 && (
                  <tr><td colSpan={2} className="px-4 py-3 text-gray-400 italic">কোনো এন্ট্রি নেই</td></tr>
                )}
              </tbody>
              <tfoot className="border-t-2 font-semibold bg-gray-50">
                <tr>
                  <td className="px-4 py-2">Total Liabilities</td>
                  <td className="px-4 py-2 text-right">{totalLiabilities.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <div className="bg-purple-50 px-4 py-2 font-semibold text-purple-800">Equity</div>
            <table className="w-full text-sm">
              <tbody>
                {equityRows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-2">{r.account_code} - {r.account_name}</td>
                    <td className="px-4 py-2 text-right">{r.amount.toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="border-t">
                  <td className="px-4 py-2">Retained Earnings (Net Profit/Loss)</td>
                  <td className="px-4 py-2 text-right">{netProfit.toFixed(2)}</td>
                </tr>
              </tbody>
              <tfoot className="border-t-2 font-semibold bg-gray-50">
                <tr>
                  <td className="px-4 py-2">Total Equity</td>
                  <td className="px-4 py-2 text-right">{totalEquity.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-6">
        <div className="rounded-xl border p-4 text-center font-semibold bg-gray-50">
          Total Assets: {totalAssets.toFixed(2)}
        </div>
        <div className="rounded-xl border p-4 text-center font-semibold bg-gray-50">
          Total Liabilities + Equity: {totalLiabilitiesAndEquity.toFixed(2)}
        </div>
      </div>

      <div className={`mt-4 rounded-xl border p-4 text-center font-semibold ${
        isBalanced ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-800 border-red-200"
      }`}>
        {isBalanced
          ? "✅ Assets = Liabilities + Equity — ব্যালেন্স শীট সঠিক আছে।"
          : `⚠ মিলছে না (পার্থক্য: ${Math.abs(totalAssets - totalLiabilitiesAndEquity).toFixed(2)})`}
      </div>
    </div>
  );
}