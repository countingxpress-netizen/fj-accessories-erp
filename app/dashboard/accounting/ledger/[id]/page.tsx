import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { formatDate } from "@/lib/formatDate";
import { money } from "@/lib/format";
import { fetchAllRows } from "@/lib/fetchAll";
import { resolveDatePreset, datePresetLabel } from "@/lib/datePresets";
import DateRangeFields from "@/components/DateRangeFields";

// Debit-normal accounts (asset, expense): debit বাড়ায়, credit কমায়
// Credit-normal accounts (liability, equity, income): credit বাড়ায়, debit কমায়
const debitNormalTypes = ["asset", "expense"];

export default async function AccountLedgerPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { id } = await params;
  // তারিখ-ফিল্টার preset — ডিফল্ট All Time (আগের মতো); সময়ের আগের লেনদেন "Opening Balance" সারিতে
  const sp = await searchParams;
  const period = resolveDatePreset(sp.range, sp.from, sp.to, "all");
  const from = period.from || undefined;
  const to = period.to || undefined;
  const supabase = await createClient();

  const { data: account } = await supabase
    .from("chart_of_accounts")
    .select("*")
    .eq("id", id)
    .single();

  if (!account) return notFound();

  const lines = await fetchAllRows<any>(
    supabase, "journal_entry_lines", "*, journal_vouchers(voucher_no, voucher_date, narration)",
    (q) => q.eq("account_id", id)
  );

  const isDebitNormal = debitNormalTypes.includes(account.account_type);

  // তারিখ অনুযায়ী সাজান (ভাউচার তারিখ, তারপর voucher_no দিয়ে টাই-ব্রেক)
  const sorted = (lines ?? []).sort((a: any, b: any) => {
    const dateA = a.journal_vouchers?.voucher_date ?? "";
    const dateB = b.journal_vouchers?.voucher_date ?? "";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return (a.journal_vouchers?.voucher_no ?? "").localeCompare(b.journal_vouchers?.voucher_no ?? "");
  });

  const signed = (l: any) => (isDebitNormal ? (l.debit || 0) - (l.credit || 0) : (l.credit || 0) - (l.debit || 0));
  const dateOf = (l: any) => l.journal_vouchers?.voucher_date ?? "";
  const openingBalance = from ? sorted.filter((l: any) => dateOf(l) < from).reduce((s: number, l: any) => s + signed(l), 0) : 0;
  const inRange = sorted.filter((l: any) => (!from || dateOf(l) >= from) && (!to || dateOf(l) <= to));

  let runningBalance = openingBalance;
  const rows = inRange.map((l: any) => {
    runningBalance += signed(l);
    return { ...l, runningBalance };
  });

  const totalDebit = inRange.reduce((sum: number, l: any) => sum + (l.debit || 0), 0);
  const totalCredit = inRange.reduce((sum: number, l: any) => sum + (l.credit || 0), 0);

  return (
    <div>
      <Link href="/dashboard/accounting/ledger" className="text-sm text-gray-500 hover:underline">
        ← সব অ্যাকাউন্টের তালিকায় ফিরুন
      </Link>

      <h1 className="text-2xl font-semibold mt-2 mb-1">
        {account.account_code} - {account.account_name}
      </h1>
      <p className="text-sm text-gray-500 mb-4"><span className="capitalize">{account.account_type}</span> · {datePresetLabel(period)}</p>

      <form className="mb-4 flex flex-wrap items-end gap-3">
        <DateRangeFields preset={period.preset} from={period.from} to={period.to} includeAll />
        <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">দেখুন</button>
      </form>

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Voucher No</th>
              <th className="px-4 py-2">Narration / Memo</th>
              <th className="px-4 py-2 text-right">Debit</th>
              <th className="px-4 py-2 text-right">Credit</th>
              <th className="px-4 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {from && (
              <tr className="border-t bg-gray-50/60">
                <td colSpan={5} className="px-4 py-2 font-medium text-gray-600">Opening Balance (এই সময়ের আগ পর্যন্ত)</td>
                <td className="px-4 py-2 text-right font-medium">{money(openingBalance)}</td>
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
                <td className="px-4 py-2 text-right">{l.debit ? money(l.debit) : ""}</td>
                <td className="px-4 py-2 text-right">{l.credit ? money(l.credit) : ""}</td>
                <td className="px-4 py-2 text-right font-medium">
                  {money(l.runningBalance)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-3 text-gray-400 italic">
                  {from || to ? "এই সময়ে কোনো এন্ট্রি নেই" : "এই অ্যাকাউন্টে এখনো কোনো এন্ট্রি নেই"}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-gray-50 border-t font-medium">
            <tr>
              <td colSpan={3} className="px-4 py-2 text-right">Total</td>
              <td className="px-4 py-2 text-right">{money(totalDebit)}</td>
              <td className="px-4 py-2 text-right">{money(totalCredit)}</td>
              <td className="px-4 py-2 text-right">
                {money(rows.length > 0 ? rows[rows.length - 1].runningBalance : openingBalance)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}