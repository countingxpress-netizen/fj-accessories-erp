import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";

export default async function CashBookPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const supabase = await createClient();

  // "Cash" শব্দ থাকা সব অ্যাকাউন্ট (যেমন Cash in Hand) কে cash account ধরা হচ্ছে
  const { data: cashAccounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name")
    .ilike("account_name", "%cash%");

  const cashAccountIds = (cashAccounts ?? []).map((a) => a.id);

  let query = supabase
    .from("journal_entry_lines")
    .select("*, journal_vouchers(voucher_no, voucher_date, narration)")
    .in("account_id", cashAccountIds.length ? cashAccountIds : ["00000000-0000-0000-0000-000000000000"]);

  const { data: lines } = await query;

  let filtered = lines ?? [];
  if (from) filtered = filtered.filter((l: any) => l.journal_vouchers?.voucher_date >= from);
  if (to) filtered = filtered.filter((l: any) => l.journal_vouchers?.voucher_date <= to);

  const sorted = filtered.sort((a: any, b: any) => {
    const dateA = a.journal_vouchers?.voucher_date ?? "";
    const dateB = b.journal_vouchers?.voucher_date ?? "";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return (a.journal_vouchers?.voucher_no ?? "").localeCompare(b.journal_vouchers?.voucher_no ?? "");
  });

  // Opening balance: from তারিখের আগের সব cash এন্ট্রি যোগ করে
  let openingBalance = 0;
  if (from) {
    const before = (lines ?? []).filter(
      (l: any) => (l.journal_vouchers?.voucher_date ?? "") < from
    );
    openingBalance = before.reduce(
      (sum: number, l: any) => sum + (l.debit || 0) - (l.credit || 0),
      0
    );
  }

  let runningBalance = openingBalance;
  const rows = sorted.map((l: any) => {
    runningBalance += (l.debit || 0) - (l.credit || 0);
    return { ...l, runningBalance };
  });

  const totalReceipt = sorted.reduce((sum: number, l: any) => sum + (l.debit || 0), 0);
  const totalPayment = sorted.reduce((sum: number, l: any) => sum + (l.credit || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">Cash Book</h1>
        <Link href="/dashboard/accounting" className="text-sm text-gray-500 hover:underline">
          ← Accounting-এ ফিরুন
        </Link>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        {(cashAccounts ?? []).map((a) => a.account_name).join(", ") || "কোনো Cash অ্যাকাউন্ট পাওয়া যায়নি"}
      </p>

      <form className="mb-4 flex items-end gap-3">
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
        {(from || to) && (
          <Link href="/dashboard/accounting/cash-book" className="text-sm text-gray-500 hover:underline">
            রিসেট করুন
          </Link>
        )}
      </form>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Voucher No</th>
              <th className="px-4 py-2">Narration / Memo</th>
              <th className="px-4 py-2 text-right">Receipt (Debit)</th>
              <th className="px-4 py-2 text-right">Payment (Credit)</th>
              <th className="px-4 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {from && (
              <tr className="border-t bg-gray-50/60">
                <td colSpan={5} className="px-4 py-2 font-medium text-gray-600">
                  Opening Balance
                </td>
                <td className="px-4 py-2 text-right font-medium">{openingBalance.toFixed(2)}</td>
              </tr>
            )}
            {rows.map((l: any) => (
              <tr key={l.id} className="border-t">
                <td className="px-4 py-2 text-gray-500">{l.journal_vouchers?.voucher_date}</td>
                <td className="px-4 py-2">
                  <Link
                    href={`/dashboard/accounting/journal/${l.voucher_id}/edit`}
                    className="text-blue-700 hover:underline"
                  >
                    {l.journal_vouchers?.voucher_no}
                  </Link>
                </td>
                <td className="px-4 py-2 text-gray-600">
                  {l.memo || l.journal_vouchers?.narration || "-"}
                </td>
                <td className="px-4 py-2 text-right">{l.debit ? l.debit.toFixed(2) : ""}</td>
                <td className="px-4 py-2 text-right">{l.credit ? l.credit.toFixed(2) : ""}</td>
                <td className="px-4 py-2 text-right font-medium">{l.runningBalance.toFixed(2)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-3 text-gray-400 italic">
                  এই সময়সীমায় কোনো Cash এন্ট্রি নেই
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t-2 font-semibold bg-gray-50">
            <tr>
              <td colSpan={3} className="px-4 py-3 text-right">Total</td>
              <td className="px-4 py-3 text-right">{totalReceipt.toFixed(2)}</td>
              <td className="px-4 py-3 text-right">{totalPayment.toFixed(2)}</td>
              <td className="px-4 py-3 text-right">
                {rows.length > 0 ? rows[rows.length - 1].runningBalance.toFixed(2) : openingBalance.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}