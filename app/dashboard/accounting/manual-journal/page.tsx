import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import VouchersTable from "../journal/VouchersTable";

// শুধু হাতে-বানানো Journal Voucher (source='manual')। সিস্টেম-জেনারেটেড ভাউচার
// (Sales Invoice / Payroll / Purchase / Freight / Wastage / Payment / Opening ...)
// এখানে দেখাবে না — সেসব "Journal Vouchers" পেজে সব একসাথে থাকে।
export default async function ManualJournalListPage() {
  const supabase = await createClient();
  const { data: vouchers } = await supabase
    .from("journal_vouchers")
    .select("*, journal_entry_lines(debit, credit), creator:app_users!journal_vouchers_created_by_fkey(full_name)")
    .eq("source", "manual")
    .order("voucher_date", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-semibold">Manual Journal</h1>
        <Link
          href="/dashboard/accounting/journal/new"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white"
        >
          + নতুন Voucher
        </Link>
      </div>
      <p className="mb-4 text-sm text-gray-500">
        শুধু হাতে করা এন্ট্রি। সিস্টেম-জেনারেটেড ভাউচার (Invoice / Payroll / Purchase / Payment
        ইত্যাদি) দেখতে{" "}
        <Link href="/dashboard/accounting/journal" className="text-blue-700 hover:underline">
          Journal Vouchers
        </Link>{" "}
        পেজে যান।
      </p>

      <VouchersTable vouchers={vouchers ?? []} />
    </div>
  );
}
