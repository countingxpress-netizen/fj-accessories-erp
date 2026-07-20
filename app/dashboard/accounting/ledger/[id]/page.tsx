import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { formatDate } from "@/lib/formatDate";

// Debit-normal accounts (asset, expense): debit বাড়ায়, credit কমায়
// Credit-normal accounts (liability, equity, income): credit বাড়ায়, debit কমায়
const debitNormalTypes = ["asset", "expense"];

export default async function AccountLedgerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: account } = await supabase
    .from("chart_of_accounts")
    .select("*")
    .eq("id", id)
    .single();

  if (!account) return notFound();

  const { data: lines } = await supabase
    .from("journal_entry_lines")
    .select("*, journal_vouchers(voucher_no, voucher_date, narration)")
    .eq("account_id", id);

  const isDebitNormal = debitNormalTypes.includes(account.account_type);

  // তারিখ অনুযায়ী সাজান (ভাউচার তারিখ, তারপর voucher_no দিয়ে টাই-ব্রেক)
  const sorted = (lines ?? []).sort((a: any, b: any) => {
    const dateA = a.journal_vouchers?.voucher_date ?? "";
    const dateB = b.journal_vouchers?.voucher_date ?? "";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return (a.journal_vouchers?.voucher_no ?? "").localeCompare(b.journal_vouchers?.voucher_no ?? "");
  });

  let runningBalance = 0;
  const rows = sorted.map((l: any) => {
    const debit = l.debit || 0;
    const credit = l.credit || 0;
    runningBalance += isDebitNormal ? debit - credit : credit - debit;
    return { ...l, runningBalance };
  });

  const totalDebit = sorted.reduce((sum: number, l: any) => sum + (l.debit || 0), 0);
  const totalCredit = sorted.reduce((sum: number, l: any) => sum + (l.credit || 0), 0);

  return (
    <div>
      <Link href="/dashboard/accounting/ledger" className="text-sm text-gray-500 hover:underline">
        ← সব অ্যাকাউন্টের তালিকায় ফিরুন
      </Link>

      <h1 className="text-2xl font-semibold mt-2 mb-1">
        {account.account_code} - {account.account_name}
      </h1>
      <p className="text-sm text-gray-500 mb-4 capitalize">{account.account_type}</p>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
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
                <td className="px-4 py-2 text-right font-medium">
                  {l.runningBalance.toFixed(2)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-3 text-gray-400 italic">
                  এই অ্যাকাউন্টে এখনো কোনো এন্ট্রি নেই
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-gray-50 border-t font-medium">
            <tr>
              <td colSpan={3} className="px-4 py-2 text-right">Total</td>
              <td className="px-4 py-2 text-right">{totalDebit.toFixed(2)}</td>
              <td className="px-4 py-2 text-right">{totalCredit.toFixed(2)}</td>
              <td className="px-4 py-2 text-right">
                {rows.length > 0 ? rows[rows.length - 1].runningBalance.toFixed(2) : "0.00"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}