import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/fetchAll";
import VouchersTable from "../journal/VouchersTable";

// শুধু হাতে-বানানো Journal Voucher (source='manual')। সিস্টেম-জেনারেটেড ভাউচার
// (Sales Invoice / Payroll / Purchase / Freight / Wastage / Payment / Opening ...)
// এখানে দেখাবে না — সেসব "Journal Vouchers" পেজে সব একসাথে থাকে।
export default async function ManualJournalListPage() {
  const supabase = await createClient();
  // 1000+ voucher হয়ে গেছে — Supabase-এর 1000-রো ক্যাপে যেন পুরনোগুলো বাদ না পড়ে, পেজ করে সব আনা।
  // লাইনের account নামসহ আনা হয় যাতে রো-তে ক্লিক করলে ডিটেলস দেখানো ও account দিয়ে সার্চ করা যায়।
  const vouchers = (await fetchAllRows<any>(
    supabase,
    "journal_vouchers",
    "*, journal_entry_lines(id, debit, credit, memo, chart_of_accounts(account_code, account_name)), creator:app_users!journal_vouchers_created_by_fkey(full_name)",
    (q) => q.eq("source", "manual")
  )).sort((a, b) =>
    (b.voucher_date ?? "").localeCompare(a.voucher_date ?? "") || (b.created_at ?? "").localeCompare(a.created_at ?? "")
  );

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

      <VouchersTable vouchers={vouchers} />
    </div>
  );
}
