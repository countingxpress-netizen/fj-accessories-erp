import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import { money } from "@/lib/format";
import PrintButton from "@/app/dashboard/PrintButton";
import { fetchAllRows } from "@/lib/fetchAll";
import { resolveDatePreset } from "@/lib/datePresets";
import DateRangeFields from "@/components/DateRangeFields";

export default async function CashFlowPage({
  searchParams,
}: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const { range, from: rawFrom, to: rawTo } = await searchParams;
  // তারিখ-ফিল্টার preset (Today … Previous Year / Date Range / All Time) — ডিফল্ট All Time (আগের মতো)
  const period = resolveDatePreset(range, rawFrom, rawTo, "all");
  const from = period.from || undefined;
  const to = period.to || undefined;
  const supabase = await createClient();

  const { data: cashBankAccounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name")
    .eq("account_type", "asset")
    .or("account_name.ilike.%cash%,account_name.ilike.%bank%");

  const accountIds = (cashBankAccounts ?? []).map((a) => a.id);

  const lines = await fetchAllRows<any>(
    supabase, "journal_entry_lines", "*, journal_vouchers(voucher_no, voucher_date, narration), chart_of_accounts(account_name)",
    (q) => q.in("account_id", accountIds.length ? accountIds : ["00000000-0000-0000-0000-000000000000"])
  );

  let filtered = lines ?? [];
  if (from) filtered = filtered.filter((l: any) => (l.journal_vouchers?.voucher_date ?? "") >= from);
  if (to) filtered = filtered.filter((l: any) => (l.journal_vouchers?.voucher_date ?? "") <= to);

  const sorted = filtered.sort((a: any, b: any) => (a.journal_vouchers?.voucher_date ?? "").localeCompare(b.journal_vouchers?.voucher_date ?? ""));

  const totalInflow = sorted.reduce((s: number, l: any) => s + (l.debit || 0), 0);
  const totalOutflow = sorted.reduce((s: number, l: any) => s + (l.credit || 0), 0);
  const netCashFlow = totalInflow - totalOutflow;

  const excelRows: (string | number)[][] = [
    ["Cash Flow", from || to ? `${from ?? ""} - ${to ?? ""}` : "All Time"],
    ["Total Inflow", Number(totalInflow.toFixed(2))],
    ["Total Outflow", Number(totalOutflow.toFixed(2))],
    ["Net Cash Flow", Number(netCashFlow.toFixed(2))],
    [],
    ["Date", "Account", "Narration", "Inflow", "Outflow"],
    ...sorted.map((l: any) => [
      formatDate(l.journal_vouchers?.voucher_date), l.chart_of_accounts?.account_name, l.memo || l.journal_vouchers?.narration || "-",
      l.debit ? Number(l.debit) : "", l.credit ? Number(l.credit) : "",
    ]),
  ];

  return (
    <div>
      <div className="print:hidden flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Cash Flow</h1>
        <Link href="/dashboard/reports" className="text-sm text-gray-500 hover:underline">← Reports-এ ফিরুন</Link>
      </div>

      <form className="print:hidden mb-4 flex flex-wrap items-end gap-3">
        <DateRangeFields preset={period.preset} from={period.from} to={period.to} includeAll />
        <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">ফিল্টার করুন</button>
      </form>

      <PrintButton excelFilename="Cash-Flow" excelSheets={[{ name: "Cash Flow", rows: excelRows }]} />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Total Inflow</p>
          <p className="text-lg font-semibold text-green-700">{money(totalInflow)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Total Outflow</p>
          <p className="text-lg font-semibold text-red-700">{money(totalOutflow)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Net Cash Flow</p>
          <p className={`text-lg font-semibold ${netCashFlow >= 0 ? "text-green-700" : "text-red-700"}`}>{money(netCashFlow)}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
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
                <td className="px-4 py-2 text-right">{l.debit ? money(l.debit) : ""}</td>
                <td className="px-4 py-2 text-right">{l.credit ? money(l.credit) : ""}</td>
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