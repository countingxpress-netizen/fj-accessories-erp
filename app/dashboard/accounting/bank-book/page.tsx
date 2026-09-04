import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/format";

export default async function BankBookPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; from?: string; to?: string }>;
}) {
  const { account, from, to } = await searchParams;
  const supabase = await createClient();

  // ব্যাংক-সম্পর্কিত সব অ্যাকাউন্ট (Uttara Bank, BRAC Bank, EBL, Bank Loan বাদে asset হিসেবে যেগুলো "Bank" নামে আছে)
  const { data: bankAccounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name")
    .eq("account_type", "asset")
    .or("account_name.ilike.%uttara%,account_name.ilike.%brac%,account_name.ilike.%ebl%,account_name.ilike.%bank%")
    .order("account_code");

  const selectedAccountId = account || (bankAccounts && bankAccounts[0]?.id) || "";

  let rows: any[] = [];
  let openingBalance = 0;
  let selectedAccount = bankAccounts?.find((a) => a.id === selectedAccountId);

  if (selectedAccountId) {
    const { data: lines } = await supabase
      .from("journal_entry_lines")
      .select("*, journal_vouchers(voucher_no, voucher_date, narration)")
      .eq("account_id", selectedAccountId);

    let filtered = lines ?? [];

    if (from) {
      const before = (lines ?? []).filter(
        (l: any) => (l.journal_vouchers?.voucher_date ?? "") < from
      );
      openingBalance = before.reduce(
        (sum: number, l: any) => sum + (l.debit || 0) - (l.credit || 0),
        0
      );
      filtered = filtered.filter((l: any) => l.journal_vouchers?.voucher_date >= from);
    }
    if (to) filtered = filtered.filter((l: any) => l.journal_vouchers?.voucher_date <= to);

    const sorted = filtered.sort((a: any, b: any) => {
      const dateA = a.journal_vouchers?.voucher_date ?? "";
      const dateB = b.journal_vouchers?.voucher_date ?? "";
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return (a.journal_vouchers?.voucher_no ?? "").localeCompare(b.journal_vouchers?.voucher_no ?? "");
    });

    let runningBalance = openingBalance;
    rows = sorted.map((l: any) => {
      runningBalance += (l.debit || 0) - (l.credit || 0);
      return { ...l, runningBalance };
    });
  }

  const totalDeposit = rows.reduce((sum, l) => sum + (l.debit || 0), 0);
  const totalWithdrawal = rows.reduce((sum, l) => sum + (l.credit || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Bank Book</h1>
        <Link href="/dashboard/accounting" className="text-sm text-gray-500 hover:underline">
          ← Accounting-এ ফিরুন
        </Link>
      </div>

      <form className="mb-4 flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Bank Account</label>
          <select
            name="account"
            defaultValue={selectedAccountId}
            className="rounded-lg border px-3 py-2 text-sm min-w-[220px]"
          >
            {(bankAccounts ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.account_code} - {a.account_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" name="from" defaultValue={from} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" name="to" defaultValue={to} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">
          দেখুন / ফিল্টার করুন
        </button>
      </form>

      {!bankAccounts?.length && (
        <p className="text-sm text-gray-500">কোনো ব্যাংক অ্যাকাউন্ট Chart of Accounts-এ পাওয়া যায়নি।</p>
      )}

      {selectedAccount && (
        <>
          <p className="text-sm text-gray-500 mb-2">
            দেখানো হচ্ছে: <span className="font-medium text-gray-700">{selectedAccount.account_name}</span>
          </p>

          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Voucher No</th>
                  <th className="px-4 py-2">Narration / Memo</th>
                  <th className="px-4 py-2 text-right">Deposit (Debit)</th>
                  <th className="px-4 py-2 text-right">Withdrawal (Credit)</th>
                  <th className="px-4 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {from && (
                  <tr className="border-t bg-gray-50/60">
                    <td colSpan={5} className="px-4 py-2 font-medium text-gray-600">
                      Opening Balance
                    </td>
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
                    <td className="px-4 py-2 text-right font-medium">{money(l.runningBalance)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-3 text-gray-400 italic">
                      এই সময়সীমায় কোনো এন্ট্রি নেই
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="border-t-2 font-semibold bg-gray-50">
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-right">Total</td>
                  <td className="px-4 py-3 text-right">{money(totalDeposit)}</td>
                  <td className="px-4 py-3 text-right">{money(totalWithdrawal)}</td>
                  <td className="px-4 py-3 text-right">
                    {rows.length > 0 ? money(rows[rows.length - 1].runningBalance) : money(openingBalance)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}