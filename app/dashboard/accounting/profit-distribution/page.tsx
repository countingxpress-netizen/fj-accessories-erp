import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/payroll";
import { money } from "@/lib/format";
import { monthNetProfit, distributedVoucherNo, splitProfit, monthLabel } from "@/lib/profitDistribution";
import DistributeForm from "./DistributeForm";

export default async function ProfitDistributionPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const supabase = await createClient();

  const [ty, tm] = todayLocal().split("-").map(Number);
  // ডিফল্ট = আগের মাস
  const defYear = tm === 1 ? ty - 1 : ty;
  const defMonth = tm === 1 ? 12 : tm - 1;
  const [year, month] =
    m && /^\d{4}-\d{2}$/.test(m) ? m.split("-").map(Number) : [defYear, defMonth];
  const monthValue = `${year}-${String(month).padStart(2, "0")}`;

  const { income, expense, net } = await monthNetProfit(supabase, year, month);
  const already = await distributedVoucherNo(supabase, year, month);
  const { lillah, omar } = splitProfit(net);
  const isLoss = net < 0;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">Profit বণ্টন (মাস-শেষ)</h1>
        <Link href="/dashboard/accounting" className="text-sm text-gray-500 hover:underline">← Accounting-এ ফিরুন</Link>
      </div>
      <p className="text-sm text-gray-500 mb-4 max-w-xl">
        মাস বাছাই করুন — ওই মাসের net লাভ/লস দেখানো হবে। বণ্টন করলে JV পোস্ট হয়:
        লাভে <strong>1% লিল্লাহ্ ফান্ড</strong> + <strong>99% ওমর ফারুক</strong>; লসে <strong>100% ওমর ফারুক</strong>।
        এক মাসে একবার।
      </p>

      <form className="mb-6 flex items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">মাস</label>
          <input type="month" name="m" defaultValue={monthValue} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">দেখুন</button>
      </form>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden mb-4">
        <div className="bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">{monthLabel(year, month)}</div>
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-t"><td className="px-4 py-2">Income</td><td className="px-4 py-2 text-right">{money(income)}</td></tr>
            <tr className="border-t"><td className="px-4 py-2">Expense</td><td className="px-4 py-2 text-right">{money(expense)}</td></tr>
            <tr className="border-t font-semibold bg-gray-50">
              <td className="px-4 py-2">{isLoss ? "Net Loss" : "Net Profit"}</td>
              <td className={`px-4 py-2 text-right ${isLoss ? "text-red-700" : "text-green-700"}`}>{money(Math.abs(net))}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {Math.abs(net) < 0.005 ? (
        <p className="rounded-lg border bg-gray-50 px-4 py-3 text-sm text-gray-500">এই মাসে বণ্টনের মতো কিছু নেই।</p>
      ) : already ? (
        <p className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
          ✅ {monthLabel(year, month)}-এর বণ্টন আগেই পোস্ট করা হয়েছে —{" "}
          <Link href="/dashboard/accounting/journal" className="font-medium underline">{already}</Link>
        </p>
      ) : (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">বণ্টন JV (auto)</div>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500"><th className="px-4 py-2">Account</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th></tr></thead>
            <tbody>
              {isLoss ? (
                <>
                  <tr className="border-t"><td className="px-4 py-2">3300 ওমর ফারুক – Profit Account</td><td className="px-4 py-2 text-right">{money(-net)}</td><td /></tr>
                  <tr className="border-t"><td className="px-4 py-2">3100 Retained Earnings</td><td /><td className="px-4 py-2 text-right">{money(-net)}</td></tr>
                </>
              ) : (
                <>
                  <tr className="border-t"><td className="px-4 py-2">3100 Retained Earnings</td><td className="px-4 py-2 text-right">{money(net)}</td><td /></tr>
                  <tr className="border-t"><td className="px-4 py-2">2800 লিল্লাহ্ ফান্ড (Receivable) — 1%</td><td /><td className="px-4 py-2 text-right">{money(lillah)}</td></tr>
                  <tr className="border-t"><td className="px-4 py-2">3300 ওমর ফারুক – Profit Account — 99%</td><td /><td className="px-4 py-2 text-right">{money(omar)}</td></tr>
                </>
              )}
            </tbody>
          </table>
          <div className="px-4 py-3 border-t">
            <DistributeForm year={year} month={month} label={monthLabel(year, month)} />
          </div>
        </div>
      )}
    </div>
  );
}
