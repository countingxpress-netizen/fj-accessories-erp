import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import VoucherRow from "./VoucherRow";
import { formatDate } from "@/lib/formatDate";

export default async function JournalListPage() {
  const supabase = await createClient();
  const { data: vouchers } = await supabase
    .from("journal_vouchers")
    .select("*, journal_entry_lines(debit, credit)")
    .order("voucher_date", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Journal Vouchers</h1>
        <Link
          href="/dashboard/accounting/journal/new"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white"
        >
          + নতুন Voucher
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Voucher No</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Narration</th>
              <th className="px-4 py-2 text-right">Amount</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(vouchers ?? []).map((v: any) => (
              <VoucherRow key={v.id} voucher={v} />
            ))}
            {(!vouchers || vouchers.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-3 text-gray-400 italic">
                  এখনো কোনো Journal Voucher তৈরি হয়নি
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}